#!/usr/bin/env bash
# woodright-owner-approved-release.sh
#
# Canonical owner-approved release identity for public_demo / public_production
# promotions. Separates:
#   - freeze bypass (WOODRIGHT_VALIDATION_FREEZE_OVERRIDE) - timing only
#   - release authorization - exact SHA + digests in OWNER_APPROVED_RELEASE.json
#
# Fail-closed. No euid=0 bypass. No silent fallback to EXPECTED_RELEASE / tip main /
# current pins / confirm token.
#
# Path override (WOODRIGHT_OWNER_APPROVED_RELEASE_PATH) is refused.
# Tests retarget SoT only via WOODRIGHT_META_ROOT.
#
# Exit / result tokens:
#   OWNER_APPROVAL_OK
#   OWNER_APPROVAL_MISSING
#   OWNER_APPROVAL_MALFORMED
#   OWNER_APPROVAL_MISMATCH
#   OWNER_APPROVAL_ENV_MISMATCH
#   OWNER_APPROVAL_PATH_UNSAFE
#   OWNER_APPROVAL_TOCTOU
#   OWNER_APPROVAL_EMERGENCY_DENIED
#
# shellcheck shell=bash

: "${WOODRIGHT_OWNER_APPROVED_SCHEMA_VERSION:=1}"
: "${WOODRIGHT_OWNER_APPROVED_TOOLING_SCHEMA:=owner-approved-release-v1}"

wr_owner_approved_default_path() {
  local environment="${1:-}"
  case "$environment" in
    public_demo|staging)
      printf '%s\n' "${WOODRIGHT_META_ROOT:-/srv/woodright/meta}/public_demo/OWNER_APPROVED_RELEASE.json"
      ;;
    public_production|production)
      printf '%s\n' "${WOODRIGHT_META_ROOT:-/srv/woodright/meta}/public_production/OWNER_APPROVED_RELEASE.json"
      ;;
    *)
      printf '%s\n' ""
      ;;
  esac
}

wr_owner_approved_emergency_dir() {
  local environment="${1:-}"
  case "$environment" in
    public_demo|staging)
      printf '%s\n' "${WOODRIGHT_META_ROOT:-/srv/woodright/meta}/public_demo/emergency"
      ;;
    public_production|production)
      printf '%s\n' "${WOODRIGHT_META_ROOT:-/srv/woodright/meta}/public_production/emergency"
      ;;
    *)
      printf '%s\n' ""
      ;;
  esac
}

wr_owner_approved_resolve_path() {
  local environment="${1:-}"
  local canonical
  canonical="$(wr_owner_approved_default_path "$environment")"
  # No caller path override - tests retarget via WOODRIGHT_META_ROOT only.
  if [[ -n "${WOODRIGHT_OWNER_APPROVED_RELEASE_PATH:-}" ]]; then
    return 1
  fi
  [[ -n "$canonical" ]] || return 1
  printf '%s\n' "$canonical"
  return 0
}

wr_owner_approved_sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    shasum -a 256 "$path" | awk '{print $1}'
  fi
}

wr_owner_approved_assert_path_safe() {
  local path="$1"
  local result_var="${2:-WR_OWNER_APPROVAL_RESULT}"
  if [[ -z "$path" ]]; then
    printf -v "$result_var" '%s' "OWNER_APPROVAL_MISSING"
    return 1
  fi
  if [[ ! -e "$path" ]]; then
    printf -v "$result_var" '%s' "OWNER_APPROVAL_MISSING"
    return 1
  fi
  if [[ -L "$path" ]]; then
    printf -v "$result_var" '%s' "OWNER_APPROVAL_PATH_UNSAFE"
    return 1
  fi
  if [[ ! -f "$path" ]]; then
    printf -v "$result_var" '%s' "OWNER_APPROVAL_PATH_UNSAFE"
    return 1
  fi
  local parent
  parent="$(dirname "$path")"
  if [[ -L "$parent" ]]; then
    printf -v "$result_var" '%s' "OWNER_APPROVAL_PATH_UNSAFE"
    return 1
  fi
  # Refuse group-writable or world-writable approval files.
  local mode
  mode="$(stat -c '%a' "$path" 2>/dev/null || stat -f '%OLp' "$path" 2>/dev/null || echo "")"
  if [[ -n "$mode" ]]; then
    local last="$((10#${mode: -1}))"
    local mid="$((10#${mode: -2:1}))"
    if (( last & 2 )); then
      printf -v "$result_var" '%s' "OWNER_APPROVAL_PATH_UNSAFE"
      return 1
    fi
    if (( mid & 2 )); then
      printf -v "$result_var" '%s' "OWNER_APPROVAL_PATH_UNSAFE"
      return 1
    fi
  fi
  return 0
}

wr_owner_approved_load() {
  local environment="$1"
  local path
  WR_OA_PATH=""
  WR_OA_CHECKSUM=""
  WR_OA_ENVIRONMENT=""
  WR_OA_APPLICATION_SHA=""
  WR_OA_BACKEND_DIGEST=""
  WR_OA_STOREFRONT_DIGEST=""
  WR_OA_OWNER_AUTHORIZATION_ID=""
  if ! path="$(wr_owner_approved_resolve_path "$environment")"; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_PATH_UNSAFE"
    return 1
  fi
  WR_OA_PATH="$path"
  if ! wr_owner_approved_assert_path_safe "$path" WR_OWNER_APPROVAL_RESULT; then
    return 1
  fi

  local out rc
  set +e
  out="$(python3 - "$path" "$environment" <<'PY'
import hashlib, json, sys
path, environment = sys.argv[1], sys.argv[2]
raw = open(path, "rb").read()
checksum = hashlib.sha256(raw).hexdigest()

def check_dup(pairs):
    seen = {}
    for k, v in pairs:
        if k in seen:
            raise ValueError(f"duplicate key: {k}")
        seen[k] = v
    return seen

try:
    data = json.loads(raw.decode("utf-8"), object_pairs_hook=check_dup)
except Exception:
    print("MALFORMED")
    sys.exit(2)
if not isinstance(data, dict):
    print("MALFORMED")
    sys.exit(2)

schema = data.get("schema_version")
env_f = data.get("environment")
decision = data.get("owner_decision")
app_sha = data.get("application_sha")
be_dig = data.get("backend_digest")
sf_dig = data.get("storefront_digest")
auth_id = data.get("owner_authorization_id") or ""

def norm(e):
    if e in ("staging",):
        return "public_demo"
    if e in ("production",):
        return "public_production"
    return e

env_norm = norm(environment)
file_norm = norm(env_f)
if str(schema) != "1":
    print("MALFORMED"); sys.exit(2)
if decision != "approved":
    print("MALFORMED"); sys.exit(2)
if not isinstance(app_sha, str) or len(app_sha) != 40 or any(c not in "0123456789abcdef" for c in app_sha):
    print("MALFORMED"); sys.exit(2)
import re
if not isinstance(be_dig, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", be_dig):
    print("MALFORMED"); sys.exit(2)
if not isinstance(sf_dig, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", sf_dig):
    print("MALFORMED"); sys.exit(2)
if file_norm != env_norm:
    print("ENV_MISMATCH"); sys.exit(3)

print(checksum)
print(file_norm)
print(app_sha)
print(be_dig)
print(sf_dig)
print(auth_id)
PY
)"
  rc=$?
  set -e
  if [[ "$rc" -eq 3 ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_ENV_MISMATCH"
    return 1
  fi
  if [[ "$rc" -ne 0 ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MALFORMED"
    return 1
  fi
  WR_OA_CHECKSUM="$(printf '%s\n' "$out" | sed -n '1p')"
  WR_OA_ENVIRONMENT="$(printf '%s\n' "$out" | sed -n '2p')"
  WR_OA_APPLICATION_SHA="$(printf '%s\n' "$out" | sed -n '3p')"
  WR_OA_BACKEND_DIGEST="$(printf '%s\n' "$out" | sed -n '4p')"
  WR_OA_STOREFRONT_DIGEST="$(printf '%s\n' "$out" | sed -n '5p')"
  WR_OA_OWNER_AUTHORIZATION_ID="$(printf '%s\n' "$out" | sed -n '6p')"
  WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
  return 0
}

wr_owner_approved_audit_denial() {
  local evidence_dir="${1:-}"
  local token="${2:-OWNER_APPROVAL_MISMATCH}"
  local detail="${3:-}"
  [[ -n "$evidence_dir" ]] || return 0
  mkdir -p "$evidence_dir/json" 2>/dev/null || true
  local out="$evidence_dir/json/owner-approval-denial.json"
  umask 077
  cat >"$out" <<EOF
{
  "result": "$token",
  "detail": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$detail"),
  "euid": $(id -u),
  "freeze_override": "${WOODRIGHT_VALIDATION_FREEZE_OVERRIDE:-0}",
  "emergency_rollback": "${WOODRIGHT_OWNER_EMERGENCY_ROLLBACK:-0}",
  "path": "${WR_OA_PATH:-}",
  "checksum": "${WR_OA_CHECKSUM:-}",
  "requested_sha": "${WR_OA_REQUESTED_SHA:-}",
  "requested_backend_digest": "${WR_OA_REQUESTED_BE:-}",
  "requested_storefront_digest": "${WR_OA_REQUESTED_SF:-}",
  "approved_sha": "${WR_OA_APPLICATION_SHA:-}",
  "approved_backend_digest": "${WR_OA_BACKEND_DIGEST:-}",
  "approved_storefront_digest": "${WR_OA_STOREFRONT_DIGEST:-}",
  "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

wr_owner_emergency_rollback_allowed() {
  local environment="$1"
  local req_sha="$2"
  local req_be="$3"
  local req_sf="$4"
  if [[ "${WOODRIGHT_OWNER_EMERGENCY_ROLLBACK:-0}" != "1" ]]; then
    return 1
  fi
  local reason="${WOODRIGHT_OWNER_EMERGENCY_REASON:-}"
  local man="${WOODRIGHT_OWNER_EMERGENCY_MANIFEST:-}"
  if [[ -z "$reason" || ${#reason} -lt 8 ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_EMERGENCY_DENIED"
    return 1
  fi
  if [[ -z "$man" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_EMERGENCY_DENIED"
    return 1
  fi
  # Manifest must live under canonical emergency dir (no arbitrary path).
  local edir want_prefix
  edir="$(wr_owner_approved_emergency_dir "$environment")"
  want_prefix="${edir}/"
  case "$man" in
    "$want_prefix"*) ;;
    *)
      WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_EMERGENCY_DENIED"
      return 1
      ;;
  esac
  if ! wr_owner_approved_assert_path_safe "$man" WR_OWNER_APPROVAL_RESULT; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_EMERGENCY_DENIED"
    return 1
  fi
  local parsed
  if ! parsed="$(python3 - "$man" <<'PY'
import json, re, sys
raw = open(sys.argv[1], "rb").read()
def check_dup(pairs):
    seen = {}
    for k, v in pairs:
        if k in seen:
            raise ValueError("dup")
        seen[k] = v
    return seen
data = json.loads(raw.decode("utf-8"), object_pairs_hook=check_dup)
if data.get("kind") != "pre_cutover_identity":
    raise SystemExit(2)
if not data.get("attested_at"):
    raise SystemExit(2)
sha = data.get("application_sha")
be = data.get("backend_digest")
sf = data.get("storefront_digest")
env = data.get("environment") or ""
if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
    raise SystemExit(2)
if not isinstance(be, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", be):
    raise SystemExit(2)
if not isinstance(sf, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", sf):
    raise SystemExit(2)
print(sha); print(be); print(sf); print(env)
PY
)"; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_EMERGENCY_DENIED"
    return 1
  fi
  local e_sha e_be e_sf e_env
  e_sha="$(printf '%s\n' "$parsed" | sed -n '1p')"
  e_be="$(printf '%s\n' "$parsed" | sed -n '2p')"
  e_sf="$(printf '%s\n' "$parsed" | sed -n '3p')"
  e_env="$(printf '%s\n' "$parsed" | sed -n '4p')"
  local env_norm="$environment"
  case "$environment" in
    staging) env_norm="public_demo" ;;
    production) env_norm="public_production" ;;
  esac
  if [[ -n "$e_env" ]]; then
    local file_norm="$e_env"
    case "$e_env" in
      staging) file_norm="public_demo" ;;
      production) file_norm="public_production" ;;
    esac
    if [[ "$file_norm" != "$env_norm" ]]; then
      WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_EMERGENCY_DENIED"
      return 1
    fi
  fi
  if [[ "$req_sha" != "$e_sha" || "$req_be" != "$e_be" || "$req_sf" != "$e_sf" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_EMERGENCY_DENIED"
    return 1
  fi
  WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
  WR_OA_EMERGENCY=1
  return 0
}

wr_require_owner_approved_release() {
  local environment="$1"
  local req_sha="$2"
  local req_be="${3:-}"
  local req_sf="${4:-}"
  local evidence_dir="${5:-}"
  local gate_label="${6:-gate_a}"

  WR_OA_REQUESTED_SHA="$req_sha"
  WR_OA_REQUESTED_BE="$req_be"
  WR_OA_REQUESTED_SF="$req_sf"
  WR_OA_EMERGENCY=0
  WR_OWNER_APPROVAL_RESULT=""

  if [[ ! "$req_sha" =~ ^[0-9a-f]{40}$ ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MISMATCH"
    wr_owner_approved_audit_denial "$evidence_dir" "$WR_OWNER_APPROVAL_RESULT" "requested sha not full 40-hex ($gate_label)"
    return 1
  fi
  if [[ -n "$req_be" && ! "$req_be" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MISMATCH"
    wr_owner_approved_audit_denial "$evidence_dir" "$WR_OWNER_APPROVAL_RESULT" "backend digest not full ($gate_label)"
    return 1
  fi
  if [[ -n "$req_sf" && ! "$req_sf" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MISMATCH"
    wr_owner_approved_audit_denial "$evidence_dir" "$WR_OWNER_APPROVAL_RESULT" "storefront digest not full ($gate_label)"
    return 1
  fi

  if [[ "${WOODRIGHT_DISABLE_OWNER_APPROVAL:-0}" == "1" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MISMATCH"
    wr_owner_approved_audit_denial "$evidence_dir" "$WR_OWNER_APPROVAL_RESULT" "WOODRIGHT_DISABLE_OWNER_APPROVAL forbidden ($gate_label) euid=$(id -u)"
    return 1
  fi

  if wr_owner_approved_load "$environment"; then
    local ok=1
    if [[ "$req_sha" != "$WR_OA_APPLICATION_SHA" ]]; then
      ok=0
    fi
    if [[ -n "$req_be" && "$req_be" != "$WR_OA_BACKEND_DIGEST" ]]; then
      ok=0
    fi
    if [[ -n "$req_sf" && "$req_sf" != "$WR_OA_STOREFRONT_DIGEST" ]]; then
      ok=0
    fi
    if [[ "${WOODRIGHT_OWNER_APPROVAL_REQUIRE_PAIR:-0}" == "1" ]]; then
      if [[ -z "$req_be" || -z "$req_sf" ]]; then
        ok=0
      fi
      if [[ "$req_be" != "$WR_OA_BACKEND_DIGEST" || "$req_sf" != "$WR_OA_STOREFRONT_DIGEST" ]]; then
        ok=0
      fi
    fi
    if [[ "$ok" -eq 1 ]]; then
      WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
      if [[ -n "$evidence_dir" ]]; then
        mkdir -p "$evidence_dir/json" 2>/dev/null || true
        printf '%s\n' "$WR_OA_CHECKSUM" >"$evidence_dir/json/owner-approval-checksum-${gate_label}.txt"
      fi
      return 0
    fi
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MISMATCH"
  fi

  if [[ "${WOODRIGHT_OWNER_EMERGENCY_ROLLBACK:-0}" == "1" ]]; then
    if [[ -n "$req_be" && -n "$req_sf" ]] && wr_owner_emergency_rollback_allowed "$environment" "$req_sha" "$req_be" "$req_sf"; then
      if [[ -n "$evidence_dir" ]]; then
        mkdir -p "$evidence_dir/json" 2>/dev/null || true
        printf 'emergency_ok\n' >"$evidence_dir/json/owner-approval-emergency-${gate_label}.txt"
      fi
      return 0
    fi
    WR_OWNER_APPROVAL_RESULT="${WR_OWNER_APPROVAL_RESULT:-OWNER_APPROVAL_EMERGENCY_DENIED}"
    wr_owner_approved_audit_denial "$evidence_dir" "$WR_OWNER_APPROVAL_RESULT" "emergency denied ($gate_label)"
    return 1
  fi

  WR_OWNER_APPROVAL_RESULT="${WR_OWNER_APPROVAL_RESULT:-OWNER_APPROVAL_MISMATCH}"
  wr_owner_approved_audit_denial "$evidence_dir" "$WR_OWNER_APPROVAL_RESULT" "owner approval gate failed ($gate_label) freeze_override=${WOODRIGHT_VALIDATION_FREEZE_OVERRIDE:-0} euid=$(id -u)"
  return 1
}

wr_require_owner_approved_release_under_lock() {
  local environment="$1"
  local req_sha="$2"
  local req_be="${3:-}"
  local req_sf="${4:-}"
  local evidence_dir="${5:-}"
  local expected_checksum="${6:-}"

  if ! wr_require_owner_approved_release "$environment" "$req_sha" "$req_be" "$req_sf" "$evidence_dir" "gate_b"; then
    return 1
  fi
  if [[ -n "$expected_checksum" && "$WR_OA_CHECKSUM" != "$expected_checksum" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_TOCTOU"
    wr_owner_approved_audit_denial "$evidence_dir" "OWNER_APPROVAL_TOCTOU" "approval checksum changed between gate_a and gate_b"
    return 1
  fi
  return 0
}

wr_require_owner_approved_matches_live() {
  local environment="$1"
  local live_sha="$2"
  local live_be="$3"
  local live_sf="$4"
  local evidence_dir="${5:-}"
  if ! wr_owner_approved_load "$environment"; then
    wr_owner_approved_audit_denial "$evidence_dir" "${WR_OWNER_APPROVAL_RESULT}" "gate_c load failed"
    return 1
  fi
  if [[ "$live_sha" != "$WR_OA_APPLICATION_SHA" || "$live_be" != "$WR_OA_BACKEND_DIGEST" || "$live_sf" != "$WR_OA_STOREFRONT_DIGEST" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MISMATCH"
    wr_owner_approved_audit_denial "$evidence_dir" "OWNER_APPROVAL_MISMATCH" "gate_c live pair != approval"
    return 1
  fi
  WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
  return 0
}
