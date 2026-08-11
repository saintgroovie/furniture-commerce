#!/usr/bin/env bash
# Alert destination contract for Woodright monitors (no live provider / no secrets).
# Launch readiness stays blocked while destination is absent or invalid.
# shellcheck shell=bash

wr_alert_log() { printf '%s wr_alert_contract %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
wr_alert_die() { wr_alert_log "ERROR: $*"; return 1; }

# Allowed severities for alert payloads.
wr_alert_severity_ok() {
  case "$1" in
    info|warning|critical|recovery) return 0 ;;
    *) return 1 ;;
  esac
}

# Validate alert destination path/file shape without contacting a provider.
# Destination file is a JSON contract describing how alerts would be delivered.
# It must NOT contain webhook URLs with credentials, SMTP passwords, or tokens.
wr_alert_validate_destination_file() {
  local path="$1"
  [[ -n "$path" ]] || { wr_alert_die "alert destination path empty"; return 1; }
  if [[ -L "$path" ]]; then
    wr_alert_die "alert destination must not be a symlink: $path"
    return 1
  fi
  [[ -f "$path" ]] || { wr_alert_die "alert destination missing: $path"; return 1; }
  python3 - "$path" <<'PY'
import json, sys, re, os
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    obj = json.load(f)
if not isinstance(obj, dict):
    raise SystemExit("alert destination must be a JSON object")
required = ("schema", "environment", "provider", "enabled", "dedup_window_sec")
for k in required:
    if k not in obj:
        raise SystemExit(f"missing field: {k}")
if obj.get("schema") != "woodright_alert_destination_v1":
    raise SystemExit("schema must be woodright_alert_destination_v1")
env = obj.get("environment")
expect_env = os.environ.get("WOODRIGHT_ALERT_EXPECT_ENVIRONMENT", "")
if expect_env and env != expect_env:
    raise SystemExit(f"environment mismatch have={env} want={expect_env}")
if obj.get("provider") not in ("file_sink", "webhook_deferred", "email_deferred"):
    raise SystemExit("unsupported provider")
if obj.get("enabled") is not True:
    raise SystemExit("destination enabled must be true for readiness")
blob = json.dumps(obj)
banned = re.compile(r"(?i)(password|secret|token|api[_-]?key|authorization|bearer\s)")
if banned.search(blob):
    raise SystemExit("alert destination contains forbidden secret-like keys/values")
print("ALERT_DESTINATION_OK", file=sys.stderr)
PY
}

# Build a deferred alert payload (stdout JSON). Never sends.
wr_alert_build_payload() {
  local severity="$1" environment="$2" status="$3" failed_checks_json="$4"
  local evidence_path="${5:-}" dedup_key="${6:-}"
  wr_alert_severity_ok "$severity" || { wr_alert_die "bad severity=$severity"; return 1; }
  python3 - "$severity" "$environment" "$status" "$failed_checks_json" "$evidence_path" "$dedup_key" <<'PY'
import json, sys, time
sev, env, status, failed, evidence, dedup = sys.argv[1:7]
try:
    checks = json.loads(failed) if failed else []
except Exception:
    checks = []
obj = {
    "schema": "woodright_alert_payload_v1",
    "severity": sev,
    "environment": env,
    "status": status,
    "failed_checks": checks,
    "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "evidence_path": evidence or None,
    "deduplication_key": dedup or f"{env}:{status}:{sev}",
    "delivery": "deferred_no_provider",
}
print(json.dumps(obj, indent=2))
PY
}

# Public-production readiness: destination must exist and validate.
# Returns 0 when OK; non-zero when launch should remain blocked.
wr_alert_assert_public_production_destination() {
  local path="${WOODRIGHT_ALERT_DESTINATION_PATH:-}"
  if [[ -z "$path" ]]; then
    wr_alert_die "WOODRIGHT_ALERT_DESTINATION_PATH unset (public_production readiness blocked)"
    return 1
  fi
  WOODRIGHT_ALERT_EXPECT_ENVIRONMENT=public_production wr_alert_validate_destination_file "$path"
}
