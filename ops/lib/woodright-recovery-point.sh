#!/usr/bin/env bash
# Recovery-point manifest contract (schema + validation). No secrets / no PII.
# shellcheck shell=bash

wr_rp_log() { printf '%s wr_recovery_point %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
wr_rp_die() { wr_rp_log "ERROR: $*"; return 1; }

# Validate a recovery-point JSON file. Partial DB-only / media-only → invalid for launch.
wr_validate_recovery_point_manifest() {
  local path="$1"
  [[ -n "$path" && -f "$path" ]] || { wr_rp_die "manifest missing: $path"; return 1; }
  if [[ -L "$path" ]]; then
    wr_rp_die "manifest must not be a symlink"
    return 1
  fi
  python3 - "$path" <<'PY'
import json, sys, re
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    obj = json.load(f)
if obj.get("kind") != "woodright_recovery_point":
    raise SystemExit("kind must be woodright_recovery_point")
schema = obj.get("schema") or "woodright_recovery_point_v1"
if schema not in ("woodright_recovery_point_v1", "woodright_recovery_point_v2"):
    raise SystemExit(f"unsupported schema={schema}")
required = [
    "environment", "recovery_point_id", "created_at_utc", "status",
    "application_sha", "backend_digest", "storefront_digest",
    "db", "media", "verification_status",
]
for k in required:
    if k not in obj:
        raise SystemExit(f"missing {k}")
if obj.get("environment") != "public_production" and obj.get("environment") not in (
    "public_demo", "production", "staging"
):
    raise SystemExit("invalid environment")
if obj.get("status") != "success":
    raise SystemExit("status must be success for valid recovery point")
db = obj["db"]
media = obj["media"]
for part, label in ((db, "db"), (media, "media")):
    if not isinstance(part, dict):
        raise SystemExit(f"{label} must be object")
    for k in ("path", "sha256", "size_bytes"):
        if k not in part:
            raise SystemExit(f"{label} missing {k}")
    if not part.get("path") or not part.get("sha256"):
        raise SystemExit(f"{label} incomplete")
if "file_count" not in media:
    raise SystemExit("media.file_count required")
# Partial recovery points are invalid for launch readiness
if obj.get("partial") is True:
    raise SystemExit("partial recovery point invalid")
if obj.get("verification_status") not in ("verified", "pending_rehearsal", "unverified"):
    raise SystemExit("bad verification_status")
blob = json.dumps(obj)
if re.search(r"(?i)(password|secret|token|api[_-]?key|bearer\s|@.*\.|mailto:)", blob):
    # allow digest/sha hex; block obvious secret/PII markers
    if re.search(r"(?i)(password|secret|api[_-]?key|bearer\s)", blob):
        raise SystemExit("manifest contains forbidden secret-like content")
print("RECOVERY_POINT_OK", file=sys.stderr)
PY
}

# Strict launch-ready check: structural OK + verification_status=verified + public_production.
wr_validate_recovery_point_launch_ready() {
  local path="$1"
  wr_validate_recovery_point_manifest "$path" || return 1
  python3 - "$path" <<'PY'
import json, sys
obj = json.load(open(sys.argv[1], encoding="utf-8"))
if obj.get("environment") != "public_production":
    raise SystemExit("launch-ready requires environment=public_production")
if obj.get("verification_status") != "verified":
    raise SystemExit("launch-ready requires verification_status=verified")
if not obj.get("owner_approval_checksum"):
    raise SystemExit("launch-ready requires owner_approval_checksum")
print("RECOVERY_POINT_LAUNCH_READY_OK", file=sys.stderr)
PY
}

# Build v2 recovery-point JSON to stdout from args (no file write).
# Args: env rp_id created app_sha be_digest sf_digest ops_sha owner_checksum
#       db_alias db_name db_path db_sha db_size media_path media_sha media_size media_files
#       pg_version migration_head legal payment_id notification_id actor verification
wr_build_recovery_point_v2_json() {
  python3 - "$@" <<'PY'
import json, sys
args = sys.argv[1:]
keys = [
  "environment","recovery_point_id","created_at_utc","application_sha",
  "backend_digest","storefront_digest","ops_sha","owner_approval_checksum",
  "db_alias","db_name","db_path","db_sha","db_size",
  "media_path","media_sha","media_size","media_files",
  "postgres_version","migration_head","legal_status",
  "payment_decision_id","notification_decision_id","actor","verification_status",
]
if len(args) != len(keys):
    raise SystemExit(f"arg count {len(args)} != {len(keys)}")
d = dict(zip(keys, args))
obj = {
  "kind": "woodright_recovery_point",
  "schema": "woodright_recovery_point_v2",
  "status": "success",
  "partial": False,
  "environment": d["environment"],
  "recovery_point_id": d["recovery_point_id"],
  "created_at_utc": d["created_at_utc"],
  "application_sha": d["application_sha"],
  "backend_digest": d["backend_digest"],
  "storefront_digest": d["storefront_digest"],
  "ops_sha": d["ops_sha"] or None,
  "owner_approval_checksum": d["owner_approval_checksum"] or None,
  "db": {
    "alias": d["db_alias"],
    "name": d["db_name"],
    "path": d["db_path"],
    "sha256": d["db_sha"],
    "size_bytes": int(d["db_size"]),
  },
  "media": {
    "path": d["media_path"],
    "sha256": d["media_sha"],
    "size_bytes": int(d["media_size"]),
    "file_count": int(d["media_files"]),
  },
  "postgres_version": d["postgres_version"] or None,
  "migration_head": d["migration_head"] or None,
  "legal_status": d["legal_status"] or None,
  "payment_decision_id": d["payment_decision_id"] or None,
  "notification_decision_id": d["notification_decision_id"] or None,
  "creator_actor": d["actor"] or None,
  "verification_status": d["verification_status"],
  "script": "woodright-public-production-backup-run.sh",
  "script_version": 2,
}
print(json.dumps(obj, indent=2))
PY
}
