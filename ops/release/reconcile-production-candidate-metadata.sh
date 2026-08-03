#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Metadata-only provenance correction for the PRIVATE production-candidate stack.
#
# Use when ACTIVE/OWNER/EXPECTED recorded a stale helper_install_sha because a
# legacy marker diverged from the canonical governance install marker - without
# changing containers, pins, application refs, DNS, or DB.
#
# Original recovery evidence directories are IMMUTABLE. This helper creates a
# separate correction evidence dir under /srv/woodright/reports/production/.
#
# Confirmation (execute only):
#   I_UNDERSTAND_PRODUCTION_METADATA_PROVENANCE_CORRECTION
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$SCRIPT_DIR/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$SCRIPT_DIR/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-component-authority.sh
source "$SCRIPT_DIR/../lib/woodright-component-authority.sh"
# shellcheck source=../lib/woodright-install-provenance.sh
source "$SCRIPT_DIR/../lib/woodright-install-provenance.sh"

CONFIRM_TOKEN='I_UNDERSTAND_PRODUCTION_METADATA_PROVENANCE_CORRECTION'
MODE="dry-run"
MODE_REQUESTS="|"
CORRECTION=""
SOURCE_SHA=""
OPERATION_HELPER_SHA=""
CURRENT_HELPER_SHA=""
OPERATION_HELPER_CHECKSUM=""
SF_REF=""
BE_REF=""
ORIGINAL_EVIDENCE=""
CONFIRM=""
LOCK_HELD=0
EVIDENCE_DIR=""
STATE="prepared"

# Known residual from adopt-live recovery 20260803T080330Z (immutable evidence).
KNOWN_STALE_HELPER_SHA='6db00287e6c50a9dfe4e818993dde607992082c9'
KNOWN_OPERATION_HELPER_SHA='c30ed38d185209ee25141b284705a34e7c5dea92'
KNOWN_OPERATION_HELPER_CHECKSUM='0a9a48a87618ecaaf48c52be452dce885ed9f7e99a2d1ef21ef01a22c11bb1f9'

die() { echo "ERROR: $*" >&2; exit 2; }
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

usage() {
  sed -n '1,40p' "$0"
  cat <<EOF

Usage: reconcile-production-candidate-metadata.sh \\
  --environment production \\
  --correction helper-install-provenance \\
  --application-source-sha <40hex> \\
  --operation-helper-sha <40hex> \\
  --operation-helper-checksum <64hex> \\
  --current-helper-install-sha <40hex> \\
  --storefront-ref ghcr.io/...@sha256:<64hex> \\
  --backend-ref ghcr.io/...@sha256:<64hex> \\
  --original-evidence /srv/woodright/reports/production/<dir> \\
  [--dry-run|--execute] \\
  [--confirm-mutation $CONFIRM_TOKEN]

For the 20260803 adopt-live residual, when evidence json/helper-install-sha.txt
still holds the stale marker value, --operation-helper-checksum must equal the
recovery helper script sha256 recorded at execute time
($KNOWN_OPERATION_HELPER_CHECKSUM for operation helper $KNOWN_OPERATION_HELPER_SHA).

Exit: 0 ok | 2 validation | 3 lock | 4 dry-run mismatch | 14 incomplete
EOF
}

require_full_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]] || die "refused non-40-hex SHA for $2: '${1:-}'"
}

require_immutable_ref() {
  local ref="${1:-}" kind="${2:-}"
  [[ "$ref" == ghcr.io/saintgroovie/woodright-*@sha256:* ]] || die "refused mutable/non-ghcr $kind ref"
  local dig="${ref##*@}"
  [[ "$dig" =~ ^sha256:[0-9a-f]{64}$ ]] || die "refused non-digest $kind ref"
}

record_state() {
  STATE="$1"
  [[ -n "$EVIDENCE_DIR" ]] || return 0
  mkdir -p "$EVIDENCE_DIR" 2>/dev/null || true
  printf '%s\n' "$STATE" >"$EVIDENCE_DIR/state.txt"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$STATE" >>"$EVIDENCE_DIR/state-transitions.log"
}

FULL_ARGV=("$@")
for wr_arg in "${FULL_ARGV[@]-}"; do
  case "$wr_arg" in -h|--help) usage; exit 0 ;; esac
done

wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
[[ "${WOODRIGHT_ENVIRONMENT}" == "production" ]] \
  || die "refused --environment '${WOODRIGHT_ENVIRONMENT}' (production only)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) shift 2 ;;
    --environment=*) shift ;;
    --correction) CORRECTION="${2:?}"; shift 2 ;;
    --correction=*) CORRECTION="${1#--correction=}"; shift ;;
    --application-source-sha) SOURCE_SHA="${2:?}"; shift 2 ;;
    --application-source-sha=*) SOURCE_SHA="${1#--application-source-sha=}"; shift ;;
    --operation-helper-sha) OPERATION_HELPER_SHA="${2:?}"; shift 2 ;;
    --operation-helper-sha=*) OPERATION_HELPER_SHA="${1#--operation-helper-sha=}"; shift ;;
    --operation-helper-checksum) OPERATION_HELPER_CHECKSUM="${2:?}"; shift 2 ;;
    --operation-helper-checksum=*) OPERATION_HELPER_CHECKSUM="${1#--operation-helper-checksum=}"; shift ;;
    --current-helper-install-sha) CURRENT_HELPER_SHA="${2:?}"; shift 2 ;;
    --current-helper-install-sha=*) CURRENT_HELPER_SHA="${1#--current-helper-install-sha=}"; shift ;;
    --storefront-ref) SF_REF="${2:?}"; shift 2 ;;
    --storefront-ref=*) SF_REF="${1#--storefront-ref=}"; shift ;;
    --backend-ref) BE_REF="${2:?}"; shift 2 ;;
    --backend-ref=*) BE_REF="${1#--backend-ref=}"; shift ;;
    --original-evidence) ORIGINAL_EVIDENCE="${2:?}"; shift 2 ;;
    --original-evidence=*) ORIGINAL_EVIDENCE="${1#--original-evidence=}"; shift ;;
    --dry-run) MODE="dry-run"; MODE_REQUESTS="${MODE_REQUESTS}dry-run|"; shift ;;
    --execute) MODE="execute"; MODE_REQUESTS="${MODE_REQUESTS}execute|"; shift ;;
    --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
    --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ "$CORRECTION" == "helper-install-provenance" ]] || die "refused --correction '${CORRECTION:-}' (only helper-install-provenance)"
case "$MODE_REQUESTS" in
  *"|dry-run|"*)
    case "$MODE_REQUESTS" in
      *"|execute|"*) die "refused conflicting modes: --dry-run and --execute requested together" ;;
    esac
    ;;
esac
require_full_sha "$SOURCE_SHA" application-source-sha
require_full_sha "$OPERATION_HELPER_SHA" operation-helper-sha
require_full_sha "$CURRENT_HELPER_SHA" current-helper-install-sha
require_immutable_ref "$SF_REF" storefront
require_immutable_ref "$BE_REF" backend
[[ -n "$ORIGINAL_EVIDENCE" ]] || die "missing --original-evidence"
[[ "$ORIGINAL_EVIDENCE" == /srv/woodright/reports/production/* ]] \
  || die "refused original evidence outside /srv/woodright/reports/production/: $ORIGINAL_EVIDENCE"
[[ -d "$ORIGINAL_EVIDENCE" ]] || die "original evidence directory absent: $ORIGINAL_EVIDENCE"
if [[ "$MODE" == "execute" ]]; then
  [[ "$CONFIRM" == "$CONFIRM_TOKEN" ]] || die "execute requires --confirm-mutation $CONFIRM_TOKEN"
fi

# Resolve current installed governance SHA (canonical). Dry-run reports legacy drift.
if [[ "$MODE" == "dry-run" ]]; then
  wr_resolve_installed_governance_sha --dry-run || die "canonical governance marker unresolved"
else
  wr_resolve_installed_governance_sha --mutating || die "canonical governance marker unresolved or legacy drift"
fi
[[ "$WR_INSTALLED_GOVERNANCE_SHA" == "$CURRENT_HELPER_SHA" ]] \
  || die "current helper install SHA mismatch: marker/canonical=$WR_INSTALLED_GOVERNANCE_SHA declared=$CURRENT_HELPER_SHA"

OWN_DIR="${WOODRIGHT_OWNERSHIP_DIR:-/srv/woodright/runtime-ownership-production}"
COMPOSE_ENV="${WOODRIGHT_COMPOSE_ENV_FILE:-/etc/dokploy/compose/woodright-production/code/.env}"
SF_NAME="${WOODRIGHT_SF_CONTAINER_DEFAULT:-woodright-production-storefront}"
BE_NAME="${WOODRIGHT_BE_CONTAINER_DEFAULT:-woodright-production-backend}"
LOCK_PATH="${WR_STAGING_MUTATION_LOCK_PATH:-/srv/woodright/locks/production/live-cutover.lock}"

pin_of() {
  local key="$1"
  grep -E "^${key}=" "$COMPOSE_ENV" 2>/dev/null | head -1 | cut -d= -f2- || true
}

runtime_digest() {
  local name="$1"
  python3 - "$name" <<'PY'
import json, subprocess, sys
name = sys.argv[1]
d = json.loads(subprocess.check_output(["docker", "inspect", name], text=True))[0]
img = json.loads(subprocess.check_output(["docker", "image", "inspect", d["Image"]], text=True))[0]
digs = img.get("RepoDigests") or []
print(digs[0] if digs else "")
print(d["Id"])
print(d["State"]["StartedAt"])
print((d["State"].get("Health") or {}).get("Status") or "")
print(d.get("RestartCount", 0))
PY
}

read_json() {
  python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))))' "$1"
}

# --- proofs ---
PIN_SF="$(pin_of WOODRIGHT_STOREFRONT_IMAGE)"
PIN_BE="$(pin_of WOODRIGHT_BACKEND_IMAGE)"
[[ "$PIN_SF" == "$SF_REF" ]] || die "pin storefront mismatch have='$PIN_SF' want='$SF_REF'"
[[ "$PIN_BE" == "$BE_REF" ]] || die "pin backend mismatch have='$PIN_BE' want='$BE_REF'"

mapfile -t SF_RT < <(runtime_digest "$SF_NAME")
mapfile -t BE_RT < <(runtime_digest "$BE_NAME")
[[ "${SF_RT[0]}" == "$SF_REF" ]] || die "runtime storefront mismatch have='${SF_RT[0]}' want='$SF_REF'"
[[ "${BE_RT[0]}" == "$BE_REF" ]] || die "runtime backend mismatch have='${BE_RT[0]}' want='$BE_REF'"
[[ "${SF_RT[3]}" == "healthy" && "${BE_RT[3]}" == "healthy" ]] || die "containers not healthy"

for f in ACTIVE_RELEASE.json ACTIVE_OWNER.json EXPECTED_RELEASE.json; do
  [[ -f "$OWN_DIR/$f" ]] || die "missing ownership file $OWN_DIR/$f"
done

ACTIVE_HELPER="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("helper_install_sha",""))' "$OWN_DIR/ACTIVE_RELEASE.json")"
ACTIVE_APP="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("application_source_sha",""))' "$OWN_DIR/ACTIVE_RELEASE.json")"
ACTIVE_SF="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("storefront_image",""))' "$OWN_DIR/ACTIVE_RELEASE.json")"
ACTIVE_BE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("backend_image",""))' "$OWN_DIR/ACTIVE_RELEASE.json")"

[[ "$ACTIVE_APP" == "$SOURCE_SHA" ]] || die "ACTIVE application_source_sha mismatch"
[[ "$ACTIVE_SF" == "$SF_REF" && "$ACTIVE_BE" == "$BE_REF" ]] || die "ACTIVE images do not match declared refs (pins/runtime/ACTIVE invariant broken)"
[[ "$ACTIVE_HELPER" == "$KNOWN_STALE_HELPER_SHA" || "$ACTIVE_HELPER" == "$OPERATION_HELPER_SHA" ]] \
  || die "unexpected current helper_install_sha='$ACTIVE_HELPER' (expected stale $KNOWN_STALE_HELPER_SHA or already-corrected $OPERATION_HELPER_SHA)"

# Original evidence must prove operation helper SHA without rewriting history.
EV_HELPER="$(tr -d '[:space:]' <"$ORIGINAL_EVIDENCE/json/helper-install-sha.txt" 2>/dev/null || true)"
STATE_EV="$(tr -d '[:space:]' <"$ORIGINAL_EVIDENCE/state.txt" 2>/dev/null || true)"
[[ "$STATE_EV" == "recovery_committed" ]] || die "original evidence state is not recovery_committed: '$STATE_EV'"

# Prefer an immutable evidence-side checksum file when present (future recoveries).
EV_CHECKSUM_FILE=""
for cand in \
  "$ORIGINAL_EVIDENCE/json/operation-helper-script-sha256.txt" \
  "$ORIGINAL_EVIDENCE/json/helper-script-sha256.txt" \
  "$ORIGINAL_EVIDENCE/json/helper-install-checksum.txt"
do
  if [[ -f "$cand" ]]; then
    EV_CHECKSUM_FILE="$cand"
    break
  fi
done
EV_CHECKSUM=""
if [[ -n "$EV_CHECKSUM_FILE" ]]; then
  EV_CHECKSUM="$(tr -d '[:space:]' <"$EV_CHECKSUM_FILE")"
  [[ "$EV_CHECKSUM" =~ ^[0-9a-f]{64}$ ]] || die "invalid checksum in $EV_CHECKSUM_FILE"
fi

if [[ "$EV_HELPER" == "$OPERATION_HELPER_SHA" ]]; then
  log "evidence helper-install-sha.txt already records operation helper $OPERATION_HELPER_SHA"
elif [[ "$EV_HELPER" == "$KNOWN_STALE_HELPER_SHA" ]]; then
  # Stale residual path: evidence recorded the legacy marker value. Bind the
  # operator-declared operation helper to the known recovery script checksum
  # (and to an evidence checksum file when present).
  [[ "$OPERATION_HELPER_SHA" == "$KNOWN_OPERATION_HELPER_SHA" ]] \
    || die "operation helper SHA must be the proven recovery install $KNOWN_OPERATION_HELPER_SHA (got $OPERATION_HELPER_SHA)"
  [[ -n "$OPERATION_HELPER_CHECKSUM" ]] \
    || die "stale evidence path requires --operation-helper-checksum <64hex> binding the recovery helper script"
  [[ "$OPERATION_HELPER_CHECKSUM" =~ ^[0-9a-f]{64}$ ]] \
    || die "refused non-64-hex --operation-helper-checksum"
  [[ "$OPERATION_HELPER_CHECKSUM" == "$KNOWN_OPERATION_HELPER_CHECKSUM" ]] \
    || die "operation helper checksum mismatch want=$KNOWN_OPERATION_HELPER_CHECKSUM got=$OPERATION_HELPER_CHECKSUM"
  if [[ -n "$EV_CHECKSUM" ]]; then
    [[ "$EV_CHECKSUM" == "$OPERATION_HELPER_CHECKSUM" ]] \
      || die "evidence checksum $EV_CHECKSUM_FILE=$EV_CHECKSUM does not match --operation-helper-checksum"
  fi
  log "stale residual proof accepted: evidence_helper=$EV_HELPER operation=$OPERATION_HELPER_SHA checksum=$OPERATION_HELPER_CHECKSUM"
else
  die "original evidence helper-install-sha.txt unexpected: '$EV_HELPER'"
fi

if [[ "$ACTIVE_HELPER" == "$OPERATION_HELPER_SHA" ]]; then
  log "ALREADY_CORRECTED helper_install_sha already $OPERATION_HELPER_SHA - no-op"
  cat <<EOF
{
  "tool": "reconcile-production-candidate-metadata.sh",
  "mode": "$MODE",
  "status": "already_corrected",
  "metadata_only": true,
  "container_recreate_planned": false,
  "pin_write_planned": false,
  "runtime_mutation_planned": false
}
EOF
  exit 0
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"

proposed_fields() {
  python3 - <<PY
import json
print(json.dumps({
  "application_source_sha": "$SOURCE_SHA",
  "operation_helper_install_sha": "$OPERATION_HELPER_SHA",
  "helper_install_sha": "$OPERATION_HELPER_SHA",
  "metadata_correction_helper_sha": "$CURRENT_HELPER_SHA",
  "metadata_correction_reason": "stale_legacy_helper_marker",
  "original_helper_install_sha": "$ACTIVE_HELPER",
  "original_recovery_evidence": "$ORIGINAL_EVIDENCE",
  "storefront_image": "$SF_REF",
  "backend_image": "$BE_REF",
}, indent=2))
PY
}

if [[ "$MODE" == "dry-run" ]]; then
  cat <<EOF
{
  "tool": "reconcile-production-candidate-metadata.sh",
  "mode": "dry-run",
  "correction": "$CORRECTION",
  "metadata_only": true,
  "container_recreate_planned": false,
  "pin_write_planned": false,
  "runtime_mutation_planned": false,
  "canonical_marker": "$WR_GOVERNANCE_MARKER_CANONICAL",
  "canonical_sha": "$WR_INSTALLED_GOVERNANCE_SHA",
  "legacy_cutover_status": "$WR_INSTALL_PROVENANCE_LEGACY_CUTOVER",
  "legacy_root_status": "$WR_INSTALL_PROVENANCE_LEGACY_ROOT",
  "application_source_sha": "$SOURCE_SHA",
  "pins": {"storefront": "$PIN_SF", "backend": "$PIN_BE"},
  "runtime": {"storefront": "${SF_RT[0]}", "backend": "${BE_RT[0]}", "sf_id": "${SF_RT[1]}", "be_id": "${BE_RT[1]}", "sf_started": "${SF_RT[2]}", "be_started": "${BE_RT[2]}"},
  "active": {"storefront": "$ACTIVE_SF", "backend": "$ACTIVE_BE", "helper_install_sha": "$ACTIVE_HELPER"},
  "current_incorrect_helper_sha": "$ACTIVE_HELPER",
  "proven_operation_helper_sha": "$OPERATION_HELPER_SHA",
  "operation_helper_checksum": "${OPERATION_HELPER_CHECKSUM:-}",
  "proposed_fields": $(proposed_fields),
  "metadata_files": ["$OWN_DIR/ACTIVE_RELEASE.json", "$OWN_DIR/ACTIVE_OWNER.json", "$OWN_DIR/EXPECTED_RELEASE.json"],
  "fields_guaranteed_unchanged": ["storefront_image", "backend_image", "application_source_sha", "public_exposure", "environment"],
  "lock_path": "$LOCK_PATH",
  "evidence_path_template": "/srv/woodright/reports/production/metadata-provenance-correction-<UTC>/",
  "original_evidence": "$ORIGINAL_EVIDENCE",
  "no_lock_held": true
}
EOF
  log "DRY_RUN_OK metadata_only correction=helper-install-provenance"
  exit 0
fi

# --- execute ---
# Correction evidence must never overwrite the immutable original recovery packet.
EVIDENCE_DIR="${WOODRIGHT_EVIDENCE_DIR:-/srv/woodright/reports/production/metadata-provenance-correction-$TS}"
EVIDENCE_DIR="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$EVIDENCE_DIR")"
ORIGINAL_EVIDENCE_REAL="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$ORIGINAL_EVIDENCE")"
case "$EVIDENCE_DIR" in
  "$ORIGINAL_EVIDENCE_REAL"|"$ORIGINAL_EVIDENCE_REAL"/*)
    die "refused WOODRIGHT_EVIDENCE_DIR overlapping original evidence: $EVIDENCE_DIR"
    ;;
esac
case "$ORIGINAL_EVIDENCE_REAL" in
  "$EVIDENCE_DIR"/*)
    die "refused original evidence nested under correction evidence dir: $ORIGINAL_EVIDENCE_REAL"
    ;;
esac
mkdir -p "$EVIDENCE_DIR"/{json,before,after,staging}
record_state prepared
printf '%s\n' "$SOURCE_SHA" >"$EVIDENCE_DIR/json/application-source-sha.txt"
printf '%s\n' "$OPERATION_HELPER_SHA" >"$EVIDENCE_DIR/json/operation-helper-sha.txt"
printf '%s\n' "$CURRENT_HELPER_SHA" >"$EVIDENCE_DIR/json/metadata-correction-helper-sha.txt"
printf '%s\n' "$ORIGINAL_EVIDENCE" >"$EVIDENCE_DIR/json/original-evidence.txt"
printf '%s\n' "$ACTIVE_HELPER" >"$EVIDENCE_DIR/json/original-helper-install-sha.txt"

# freeze snapshots
for f in ACTIVE_RELEASE.json ACTIVE_OWNER.json EXPECTED_RELEASE.json; do
  cp -a "$OWN_DIR/$f" "$EVIDENCE_DIR/before/$f"
done
{
  echo "sf_id=${SF_RT[1]}"
  echo "be_id=${BE_RT[1]}"
  echo "sf_started=${SF_RT[2]}"
  echo "be_started=${BE_RT[2]}"
  echo "pin_sf=$PIN_SF"
  echo "pin_be=$PIN_BE"
} >"$EVIDENCE_DIR/json/freeze.txt"

wr_staging_lock_acquire "reconcile-production-candidate-metadata" || die "lock contention"
LOCK_HELD=1
trap 'if [[ "$LOCK_HELD" == "1" ]]; then wr_staging_lock_release || true; LOCK_HELD=0; fi' EXIT

# under-lock re-freeze
mapfile -t SF_RT2 < <(runtime_digest "$SF_NAME")
mapfile -t BE_RT2 < <(runtime_digest "$BE_NAME")
[[ "${SF_RT2[1]}" == "${SF_RT[1]}" && "${BE_RT2[1]}" == "${BE_RT[1]}" ]] || die "container IDs changed under lock"
[[ "${SF_RT2[2]}" == "${SF_RT[2]}" && "${BE_RT2[2]}" == "${BE_RT[2]}" ]] || die "StartedAt changed under lock"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$PIN_SF" ]] || die "storefront pin changed under lock"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$PIN_BE" ]] || die "backend pin changed under lock"

python3 - "$OWN_DIR" "$EVIDENCE_DIR/staging" "$SOURCE_SHA" "$OPERATION_HELPER_SHA" "$CURRENT_HELPER_SHA" "$ACTIVE_HELPER" "$ORIGINAL_EVIDENCE" "$SF_REF" "$BE_REF" <<'PY'
import json, pathlib, sys, datetime
own, staging, app, op_helper, corr_helper, original_helper, original_ev, sf, be = sys.argv[1:10]
staging = pathlib.Path(staging)
staging.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
allowed_change = {
    "helper_install_sha",
    "operation_helper_install_sha",
    "metadata_correction_helper_sha",
    "metadata_correction_reason",
    "original_helper_install_sha",
    "original_recovery_evidence",
    "metadata_correction_at_utc",
    "metadata_correction_state",
    "updated_at_utc",
}
for name in ("ACTIVE_RELEASE.json", "ACTIVE_OWNER.json", "EXPECTED_RELEASE.json"):
    doc = json.loads((pathlib.Path(own) / name).read_text())
    # invariant image/app fields
    if doc.get("application_source_sha") != app:
        raise SystemExit(f"{name} application_source_sha drift")
    if name != "ACTIVE_OWNER.json":
        if doc.get("storefront_image") not in (None, "", sf) and doc.get("storefront_image") != sf:
            raise SystemExit(f"{name} storefront_image drift")
        if doc.get("backend_image") not in (None, "", be) and doc.get("backend_image") != be:
            raise SystemExit(f"{name} backend_image drift")
    doc["helper_install_sha"] = op_helper
    doc["operation_helper_install_sha"] = op_helper
    doc["metadata_correction_helper_sha"] = corr_helper
    doc["metadata_correction_reason"] = "stale_legacy_helper_marker"
    doc["original_helper_install_sha"] = original_helper
    doc["original_recovery_evidence"] = original_ev
    doc["metadata_correction_at_utc"] = now
    doc["metadata_correction_state"] = "metadata_correction_committed"
    doc["updated_at_utc"] = now
    if name == "ACTIVE_RELEASE.json":
        # keep recovery state committed
        if doc.get("state") not in ("committed", "recovery_committed"):
            doc["state"] = "committed"
    out = staging / name
    out.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n")
    out.chmod(0o600)
print("staged_ok")
PY

atomic_install() {
  local src="$1" dest="$2"
  local tmp
  tmp="$(mktemp "${dest}.tmp.XXXXXX")"
  cp "$src" "$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$dest"
}

INSTALLED=0
restore_before() {
  local f
  for f in ACTIVE_RELEASE.json ACTIVE_OWNER.json EXPECTED_RELEASE.json; do
    if [[ -f "$EVIDENCE_DIR/before/$f" ]]; then
      atomic_install "$EVIDENCE_DIR/before/$f" "$OWN_DIR/$f" || return 1
    fi
  done
  return 0
}

fail_after_metadata_write() {
  local reason="$1"
  record_state metadata_correction_incomplete
  log "ERROR: post-install verification failed: $reason - restoring before snapshots"
  printf '%s\n' "$reason" >"$EVIDENCE_DIR/json/post-install-failure.txt"
  if restore_before; then
    log "metadata before snapshots restored"
  else
    log "CRITICAL: metadata snapshot restore failed - runtime/pins untouched; monitor metadata critical"
  fi
  exit 14
}

for f in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
  atomic_install "$EVIDENCE_DIR/staging/$f" "$OWN_DIR/$f" || {
    record_state metadata_correction_incomplete
    log "atomic install failed for $f - restoring before snapshots"
    if restore_before; then
      log "metadata before snapshots restored"
    else
      log "CRITICAL: metadata snapshot restore failed"
    fi
    exit 14
  }
  INSTALLED=1
done

# verify only provenance fields changed vs before
if ! python3 - "$EVIDENCE_DIR/before" "$OWN_DIR" "$SF_REF" "$BE_REF" "$SOURCE_SHA" <<'PY'
import json, pathlib, sys
before_dir, own_dir, sf, be, app = sys.argv[1:6]
allowed = {
    "helper_install_sha", "operation_helper_install_sha", "metadata_correction_helper_sha",
    "metadata_correction_reason", "original_helper_install_sha", "original_recovery_evidence",
    "metadata_correction_at_utc", "metadata_correction_state", "updated_at_utc",
}
for name in ("ACTIVE_RELEASE.json", "ACTIVE_OWNER.json", "EXPECTED_RELEASE.json"):
    before = json.loads((pathlib.Path(before_dir) / name).read_text())
    after = json.loads((pathlib.Path(own_dir) / name).read_text())
    keys = set(before) | set(after)
    for k in keys:
        if before.get(k) != after.get(k) and k not in allowed:
            raise SystemExit(f"unexpected field change in {name}: {k}")
    if after.get("application_source_sha") != app:
        raise SystemExit("application_source_sha changed")
    if name != "ACTIVE_OWNER.json":
        if after.get("storefront_image") != sf or after.get("backend_image") != be:
            raise SystemExit("image refs changed")
print("field_diff_ok")
PY
then
  fail_after_metadata_write "field_diff_or_schema"
fi

# runtime/pins unchanged
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$PIN_SF" ]] \
  || fail_after_metadata_write "storefront_pin_mutated"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$PIN_BE" ]] \
  || fail_after_metadata_write "backend_pin_mutated"

SF_RT3_RAW=""
BE_RT3_RAW=""
if ! SF_RT3_RAW="$(runtime_digest "$SF_NAME")"; then
  fail_after_metadata_write "storefront_runtime_inspect_failed"
fi
if ! BE_RT3_RAW="$(runtime_digest "$BE_NAME")"; then
  fail_after_metadata_write "backend_runtime_inspect_failed"
fi
SF_RT3=()
BE_RT3=()
while IFS= read -r line; do SF_RT3+=("$line"); done <<<"$SF_RT3_RAW"
while IFS= read -r line; do BE_RT3+=("$line"); done <<<"$BE_RT3_RAW"
[[ "${#SF_RT3[@]}" -ge 5 && "${#BE_RT3[@]}" -ge 5 ]] \
  || fail_after_metadata_write "runtime_inspect_incomplete_fields"
[[ -n "${SF_RT3[0]:-}" && -n "${BE_RT3[0]:-}" ]] \
  || fail_after_metadata_write "runtime_refs_empty"
[[ "${SF_RT3[0]}" == "$SF_REF" && "${BE_RT3[0]}" == "$BE_REF" ]] \
  || fail_after_metadata_write "runtime_refs_changed"
[[ "${SF_RT3[1]}" == "${SF_RT[1]}" && "${BE_RT3[1]}" == "${BE_RT[1]}" ]] \
  || fail_after_metadata_write "container_ids_mutated"
[[ "${SF_RT3[2]}" == "${SF_RT[2]}" && "${BE_RT3[2]}" == "${BE_RT[2]}" ]] \
  || fail_after_metadata_write "started_at_mutated"

for f in ACTIVE_RELEASE.json ACTIVE_OWNER.json EXPECTED_RELEASE.json; do
  cp -a "$OWN_DIR/$f" "$EVIDENCE_DIR/after/$f"
done

record_state metadata_correction_committed
proposed_fields >"$EVIDENCE_DIR/json/proposed-fields.json"
cat >"$EVIDENCE_DIR/SUMMARY.md" <<EOF
# Metadata provenance correction
- correction: helper-install-provenance
- application_source_sha: $SOURCE_SHA
- operation_helper_install_sha: $OPERATION_HELPER_SHA
- metadata_correction_helper_sha: $CURRENT_HELPER_SHA
- original_helper_install_sha: $ACTIVE_HELPER
- original_recovery_evidence: $ORIGINAL_EVIDENCE
- runtime/pins unchanged
EOF

wr_staging_lock_release || true
LOCK_HELD=0
log "METADATA_PROVENANCE_CORRECTION_OK evidence=$EVIDENCE_DIR"
exit 0
