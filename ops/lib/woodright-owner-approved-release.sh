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
#   OWNER_APPROVAL_UNCHANGED
#   OWNER_APPROVAL_MISSING
#   OWNER_APPROVAL_MALFORMED
#   OWNER_APPROVAL_MISMATCH
#   OWNER_APPROVAL_ENV_MISMATCH
#   OWNER_APPROVAL_PATH_UNSAFE
#   OWNER_APPROVAL_TOCTOU
#   OWNER_APPROVAL_EMERGENCY_DENIED
#   OWNER_APPROVAL_CAS_REQUIRED
#   OWNER_APPROVAL_CAS_MISMATCH
#   OWNER_APPROVAL_RESERVED
#   OWNER_APPROVAL_CANCELLED
#   OWNER_APPROVAL_CHECKSUM_MISMATCH
#   OWNER_APPROVAL_CHECKSUM_REQUIRED
#   OWNER_APPROVAL_CUTOVER_ACTIVE
#
# Approval identity is the sha256 of the on-disk JSON (WR_OA_CHECKSUM).
# approval_generation is a stable field inside new documents. Legacy files
# omit it and load as reservation_state=legacy. Legacy is not overwrite
# permission: a writer must still name the current checksum. reservation_state
# reserved (or in_flight) blocks a normal approve. Cancel and supersede are
# explicit. A backup copy is evidence only.
#
# shellcheck shell=bash

: "${WOODRIGHT_OWNER_APPROVED_SCHEMA_VERSION:=1}"
: "${WOODRIGHT_OWNER_APPROVED_TOOLING_SCHEMA:=owner-approved-release-v1}"

wr_owner_approved_default_path() {
  local environment="${1:-}"
  # Strict mode: no aliasing. production must not share the public_production path.
  if [[ "${WOODRIGHT_OWNER_APPROVAL_STRICT_ENVIRONMENT:-0}" == "1" ]]; then
    case "$environment" in
      public_demo)
        printf '%s\n' "${WOODRIGHT_META_ROOT:-/srv/woodright/meta}/public_demo/OWNER_APPROVED_RELEASE.json"
        ;;
      public_production)
        printf '%s\n' "${WOODRIGHT_META_ROOT:-/srv/woodright/meta}/public_production/OWNER_APPROVED_RELEASE.json"
        ;;
      *)
        printf '%s\n' ""
        ;;
    esac
    return 0
  fi
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
  WR_OA_COMPONENT=""
  WR_OA_RETAINED_BACKEND_REVISION=""
  WR_OA_RETAINED_STOREFRONT_REVISION=""
  WR_OA_EXPECTED_CURRENT_SF_DIGEST=""
  WR_OA_EXPECTED_CURRENT_BE_DIGEST=""
  WR_OA_GENERATION=""
  WR_OA_RESERVATION_STATE=""
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
import hashlib, json, os, re, sys
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
# Absent component stays pair. Explicit storefront is a different contract.
component = data.get("component") or "pair"
retained_rev = data.get("retained_backend_revision") or ""
retained_sf_rev = data.get("retained_storefront_revision") or ""
expect_sf = data.get("expected_current_storefront_digest") or ""
expect_be = data.get("expected_current_backend_digest") or ""
if "approval_generation" in data:
    generation = data.get("approval_generation") or ""
    if not isinstance(generation, str) or not re.fullmatch(r"apr1-[0-9a-f]{32}", generation):
        print("MALFORMED"); sys.exit(2)
else:
    generation = ""
if "reservation_state" in data:
    reservation = data.get("reservation_state") or ""
    if reservation == "in_flight":
        reservation = "reserved"
    if reservation not in ("reserved", "committed", "cancelled", "rolled_back"):
        print("MALFORMED"); sys.exit(2)
else:
    reservation = "legacy"

def norm(e):
    if e in ("staging",):
        return "public_demo"
    if e in ("production",):
        return "public_production"
    return e

strict = os.environ.get("WOODRIGHT_OWNER_APPROVAL_STRICT_ENVIRONMENT", "0") == "1"
if strict:
    env_norm = environment
    file_norm = env_f
else:
    env_norm = norm(environment)
    file_norm = norm(env_f)
if str(schema) != "1":
    print("MALFORMED"); sys.exit(2)
if decision != "approved":
    print("MALFORMED"); sys.exit(2)
if not isinstance(app_sha, str) or len(app_sha) != 40 or any(c not in "0123456789abcdef" for c in app_sha):
    print("MALFORMED"); sys.exit(2)
if not isinstance(be_dig, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", be_dig):
    print("MALFORMED"); sys.exit(2)
if not isinstance(sf_dig, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", sf_dig):
    print("MALFORMED"); sys.exit(2)
# Line protocol: a newline inside authorization id would shift later fields
# and could make a pair file load as storefront. Reject anything but one token.
if not isinstance(auth_id, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{0,160}", auth_id):
    print("MALFORMED"); sys.exit(2)
if not isinstance(file_norm, str) or re.search(r"[\r\n]", file_norm):
    print("MALFORMED"); sys.exit(2)
if file_norm != env_norm:
    print("ENV_MISMATCH"); sys.exit(3)
if component not in ("pair", "storefront", "backend"):
    print("MALFORMED"); sys.exit(2)
if component == "pair" and retained_sf_rev:
    print("MALFORMED"); sys.exit(2)
if component == "storefront":
    if retained_sf_rev:
        print("MALFORMED"); sys.exit(2)
    if not isinstance(retained_rev, str) or not re.fullmatch(r"[0-9a-f]{40}", retained_rev):
        print("MALFORMED"); sys.exit(2)
    if not isinstance(expect_sf, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", expect_sf):
        print("MALFORMED"); sys.exit(2)
    if not isinstance(expect_be, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", expect_be):
        print("MALFORMED"); sys.exit(2)
    if expect_be != be_dig:
        print("MALFORMED"); sys.exit(2)
    if expect_sf == sf_dig or retained_rev == app_sha:
        print("MALFORMED"); sys.exit(2)
elif component == "backend":
    if env_f != "public_production" or retained_rev:
        print("MALFORMED"); sys.exit(2)
    if not isinstance(retained_sf_rev, str) or not re.fullmatch(r"[0-9a-f]{40}", retained_sf_rev):
        print("MALFORMED"); sys.exit(2)
    if not isinstance(expect_sf, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", expect_sf):
        print("MALFORMED"); sys.exit(2)
    if not isinstance(expect_be, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", expect_be):
        print("MALFORMED"); sys.exit(2)
    if expect_sf != sf_dig or expect_be == be_dig or retained_sf_rev == app_sha:
        print("MALFORMED"); sys.exit(2)
elif data.get("component") not in (None, "pair"):
    print("MALFORMED"); sys.exit(2)

print(checksum)
print(file_norm)
print(app_sha)
print(be_dig)
print(sf_dig)
print(auth_id)
print(component)
print(retained_rev)
print(expect_sf)
print(expect_be)
print(generation)
print(reservation)
print(retained_sf_rev)
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
  WR_OA_COMPONENT="$(printf '%s\n' "$out" | sed -n '7p')"
  WR_OA_RETAINED_BACKEND_REVISION="$(printf '%s\n' "$out" | sed -n '8p')"
  WR_OA_EXPECTED_CURRENT_SF_DIGEST="$(printf '%s\n' "$out" | sed -n '9p')"
  WR_OA_EXPECTED_CURRENT_BE_DIGEST="$(printf '%s\n' "$out" | sed -n '10p')"
  WR_OA_GENERATION="$(printf '%s\n' "$out" | sed -n '11p')"
  WR_OA_RESERVATION_STATE="$(printf '%s\n' "$out" | sed -n '12p')"
  WR_OA_RETAINED_STOREFRONT_REVISION="$(printf '%s\n' "$out" | sed -n '13p')"
  [[ -n "$WR_OA_COMPONENT" ]] || WR_OA_COMPONENT="pair"
  [[ -n "$WR_OA_RESERVATION_STATE" ]] || WR_OA_RESERVATION_STATE="legacy"
  WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
  return 0
}

# expected token is ABSENT or the current file checksum. Empty is not permission.
wr_owner_approved_cas_precheck() {
  local environment="$1"
  local expected="${2:-}"
  local path
  path="$(wr_owner_approved_default_path "$environment")"
  WR_OA_PATH="$path"
  if [[ -z "$expected" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CAS_REQUIRED"
    return 1
  fi
  if [[ ! -e "$path" ]]; then
    if [[ -L "$path" ]]; then
      WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_PATH_UNSAFE"
      return 1
    fi
    if [[ "$expected" == "ABSENT" ]]; then
      WR_OA_CHECKSUM=""
      WR_OA_RESERVATION_STATE="absent"
      WR_OA_GENERATION=""
      WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
      return 0
    fi
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CAS_MISMATCH"
    return 1
  fi
  if [[ "$expected" == "ABSENT" || ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CAS_MISMATCH"
    return 1
  fi
  if ! wr_owner_approved_load "$environment"; then
    return 1
  fi
  if [[ "$WR_OA_CHECKSUM" != "$expected" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CAS_MISMATCH"
    return 1
  fi
  WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
  return 0
}

wr_owner_approved_same_candidate() {
  local app_sha="$1" be_digest="$2" sf_digest="$3" component="$4"
  local retained="${5:-}" expect_sf="${6:-}" expect_be="${7:-}"
  local retained_sf="${8:-}"
  [[ "${WR_OA_APPLICATION_SHA:-}" == "$app_sha" ]] || return 1
  [[ "${WR_OA_BACKEND_DIGEST:-}" == "$be_digest" ]] || return 1
  [[ "${WR_OA_STOREFRONT_DIGEST:-}" == "$sf_digest" ]] || return 1
  [[ "${WR_OA_COMPONENT:-pair}" == "$component" ]] || return 1
  if [[ "$component" == "storefront" ]]; then
    [[ "${WR_OA_RETAINED_BACKEND_REVISION:-}" == "$retained" ]] || return 1
    [[ "${WR_OA_EXPECTED_CURRENT_SF_DIGEST:-}" == "$expect_sf" ]] || return 1
    [[ "${WR_OA_EXPECTED_CURRENT_BE_DIGEST:-}" == "$expect_be" ]] || return 1
  fi
  if [[ "$component" == "backend" ]]; then
    [[ "${WR_OA_RETAINED_STOREFRONT_REVISION:-}" == "$retained_sf" ]] || return 1
    [[ "${WR_OA_EXPECTED_CURRENT_SF_DIGEST:-}" == "$expect_sf" ]] || return 1
    [[ "${WR_OA_EXPECTED_CURRENT_BE_DIGEST:-}" == "$expect_be" ]] || return 1
  fi
  return 0
}

# Execute may omit --expected-approval-checksum only inside an isolated harness.
# WOODRIGHT_CUTOVER_HARNESS=1 against canonical production paths is not isolation.
# Paths are normalized (dot segments, then realpath when the path exists) so
# /srv/./woodright and a symlink onto /srv/woodright do not count as a sandbox.
wr_owner_approved_normalized_path() {
  local raw="$1"
  [[ -n "$raw" ]] || return 1
  python3 - "$raw" <<'PY'
import os, sys

def canonical(path, depth=0):
    if depth > 32:
        raise SystemExit(1)
    if not path.startswith("/"):
        path = os.getcwd().rstrip("/") + "/" + path
    out = "/"
    for part in path.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            out = os.path.dirname(out.rstrip("/")) or "/"
            continue
        candidate = out.rstrip("/") + "/" + part
        if os.path.islink(candidate):
            target = os.readlink(candidate)
            if not target.startswith("/"):
                target = out.rstrip("/") + "/" + target
            out = canonical(target, depth + 1)
        else:
            out = candidate
    return out

print(canonical(sys.argv[1]))
PY
}

# Success (0) means the path is on a canonical production root, after the same
# symlink-before-dotdot normalization. Compare both the literal root and its
# resolved form so a /etc -> /private/etc alias cannot hide the compose tree.
wr_owner_approved_path_is_production() {
  local path="$1" root norm
  [[ -n "$path" ]] || return 0
  for root in /srv/woodright /etc/dokploy/compose/woodright-public-production; do
    norm="$(wr_owner_approved_normalized_path "$root")" || return 0
    case "$path" in
      "$root"|"$root"/*|"$norm"|"$norm"/*) return 0 ;;
    esac
  done
  return 1
}

wr_owner_approved_harness_is_isolated() {
  [[ "${WOODRIGHT_CUTOVER_HARNESS:-0}" == "1" ]] || return 1
  local meta_raw="${WOODRIGHT_META_ROOT:-}"
  local lock_raw="${WOODRIGHT_MUTATION_LOCK_PATH:-}"
  local env_raw="${WOODRIGHT_CUTOVER_COMPOSE_ENV:-${WOODRIGHT_COMPOSE_ENV_FILE:-}}"
  local compose_raw="${WOODRIGHT_COMPOSE_FILE:-}"
  [[ -n "$meta_raw" && -n "$lock_raw" && -n "$env_raw" && -n "$compose_raw" ]] || return 1
  local meta lock env_file compose_file
  meta="$(wr_owner_approved_normalized_path "$meta_raw")" || return 1
  lock="$(wr_owner_approved_normalized_path "$lock_raw")" || return 1
  env_file="$(wr_owner_approved_normalized_path "$env_raw")" || return 1
  compose_file="$(wr_owner_approved_normalized_path "$compose_raw")" || return 1
  wr_owner_approved_path_is_production "$meta" && return 1
  wr_owner_approved_path_is_production "$lock" && return 1
  wr_owner_approved_path_is_production "$env_file" && return 1
  wr_owner_approved_path_is_production "$compose_file" && return 1
  case "$lock" in
    */locks/public_production/live-cutover.lock) ;;
    *) return 1 ;;
  esac
  return 0
}

# Execute/dry-run binding. Call immediately after Gate A, before the mutation lock.
wr_owner_approved_bind_preflight_checksum() {
  local expected="${1:-}"
  local mode="${2:-dry-run}"
  if [[ -n "$expected" && "$expected" != "${WR_OA_CHECKSUM:-}" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CHECKSUM_MISMATCH"
    return 1
  fi
  if [[ "$mode" == "execute" && -z "$expected" ]] && ! wr_owner_approved_harness_is_isolated; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CHECKSUM_REQUIRED"
    return 1
  fi
  return 0
}

wr_owner_approved_record_transition() {
  local evidence_dir="${1:-}"
  local operation="$2"
  local previous_cs="${3:-}"
  local new_cs="${4:-}"
  local reason="${5:-}"
  [[ -n "$evidence_dir" ]] || return 0
  mkdir -p "$evidence_dir/json" 2>/dev/null || return 0
  local out="$evidence_dir/json/owner-approval-transition-${operation}-$(date -u +%Y%m%dT%H%M%SZ)-$$.json"
  umask 077
  python3 - "$out" "$operation" "$previous_cs" "$new_cs" "$reason" <<'PY'
import json, os, sys
path, operation, previous_cs, new_cs, reason = sys.argv[1:6]
doc = {
    "operation": operation,
    "previous_approval_checksum": previous_cs,
    "new_approval_checksum": new_cs,
    "previous_approval_generation": os.environ.get("WR_OA_PREVIOUS_GENERATION", ""),
    "new_approval_generation": os.environ.get("WR_OA_GENERATION", ""),
    "actor": os.environ.get("WR_OA_ACTOR", ""),
    "timestamp_utc": os.environ.get("WR_OA_TRANSITION_AT", ""),
    "environment": os.environ.get("WR_OA_ENVIRONMENT", ""),
    "component": os.environ.get("WR_OA_COMPONENT", ""),
    "application_sha": os.environ.get("WR_OA_APPLICATION_SHA", ""),
    "backend_digest": os.environ.get("WR_OA_BACKEND_DIGEST", ""),
    "storefront_digest": os.environ.get("WR_OA_STOREFRONT_DIGEST", ""),
    "reservation_state": os.environ.get("WR_OA_RESERVATION_STATE", ""),
    "reason": reason,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(doc, handle, indent=2, sort_keys=True)
    handle.write("\n")
    handle.flush()
    os.fsync(handle.fileno())
PY
}

# Install staged bytes onto dest. Production seal path stays root:woodright-ops 0640.
# Callers hold the mutation lock. Backups stay evidence; this is the only installer.
wr_owner_approved_atomic_install() {
  local staged="$1"
  local dest="$2"
  local expect_cs="$3"
  local dest_dir staged_cs installed_cs
  dest_dir="$(dirname "$dest")"
  mkdir -p "$dest_dir"
  staged_cs="$(wr_owner_approved_sha256_file "$staged")"
  [[ "$staged_cs" == "$expect_cs" ]] || {
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CAS_MISMATCH"
    return 1
  }
  if [[ "$dest" == "/srv/woodright/meta/public_production/OWNER_APPROVED_RELEASE.json" \
     && "${WOODRIGHT_META_ROOT:-/srv/woodright/meta}" == "/srv/woodright/meta" ]]; then
    local seal_tmp="${dest}.seal.$$"
    [[ ! -e "$seal_tmp" && ! -L "$seal_tmp" ]] || return 1
    sudo -n cp "$staged" "$seal_tmp" || return 1
    sudo -n chown root:woodright-ops "$seal_tmp" || { sudo -n rm -f "$seal_tmp"; return 1; }
    sudo -n chmod 0640 "$seal_tmp" || { sudo -n rm -f "$seal_tmp"; return 1; }
    sudo -n python3 - "$seal_tmp" <<'PY' || { sudo -n rm -f "$seal_tmp"; return 1; }
import os, sys
fd = os.open(sys.argv[1], os.O_RDONLY)
os.fsync(fd)
os.close(fd)
PY
    installed_cs="$(sudo -n sha256sum "$seal_tmp" 2>/dev/null | awk '{print $1}')"
    if [[ -z "$installed_cs" ]]; then
      installed_cs="$(sudo -n shasum -a 256 "$seal_tmp" | awk '{print $1}')"
    fi
    [[ "$installed_cs" == "$expect_cs" ]] || { sudo -n rm -f "$seal_tmp"; return 1; }
    sudo -n mv -f "$seal_tmp" "$dest" || return 1
    sudo -n python3 - "$dest_dir" <<'PY' || return 1
import os, sys
fd = os.open(sys.argv[1], os.O_RDONLY)
os.fsync(fd)
os.close(fd)
PY
    if declare -F wr_prod_ownership_apply_access >/dev/null 2>&1; then
      wr_prod_ownership_apply_access "$dest" || return 1
    fi
  else
    python3 - "$staged" "$dest" "$expect_cs" <<'PY' || return 1
import hashlib, os, sys
src, dest, expect = sys.argv[1], sys.argv[2], sys.argv[3]
if os.path.islink(dest):
    raise SystemExit(1)
with open(src, "rb") as handle:
    data = handle.read()
if hashlib.sha256(data).hexdigest() != expect:
    raise SystemExit(2)
tmp = dest + ".tmp." + str(os.getpid())
if os.path.islink(tmp) or os.path.exists(tmp):
    raise SystemExit(1)
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
try:
    os.write(fd, data)
    os.fsync(fd)
finally:
    os.close(fd)
os.chmod(tmp, 0o644)
dir_fd = os.open(os.path.dirname(dest) or ".", os.O_RDONLY)
try:
    os.replace(tmp, dest)
    os.fsync(dir_fd)
finally:
    os.close(dir_fd)
PY
  fi
  installed_cs="$(wr_owner_approved_sha256_file "$dest")"
  [[ "$installed_cs" == "$expect_cs" && ! -L "$dest" ]] || return 1
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
    # Historical files have no component key and load as pair.
    # An explicit storefront approval must not satisfy a pair request, and a
    # pair approval must not satisfy a storefront request.
    local req_component="${WOODRIGHT_OWNER_APPROVAL_COMPONENT:-}"
    if [[ -n "$req_component" && "$req_component" != "$WR_OA_COMPONENT" ]]; then
      ok=0
    fi
    if [[ "${WR_OA_RESERVATION_STATE:-legacy}" == "cancelled" ]]; then
      WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CANCELLED"
      wr_owner_approved_audit_denial "$evidence_dir" "$WR_OWNER_APPROVAL_RESULT" "cancelled approval cannot authorize $gate_label"
      return 1
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
  local req_component="${WOODRIGHT_OWNER_APPROVAL_COMPONENT:-}"
  if [[ -n "$req_component" && "$req_component" != "${WR_OA_COMPONENT:-pair}" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MISMATCH"
    wr_owner_approved_audit_denial "$evidence_dir" "OWNER_APPROVAL_MISMATCH" "gate_c approval component != requested component"
    return 1
  fi
  if [[ "$live_sha" != "$WR_OA_APPLICATION_SHA" || "$live_be" != "$WR_OA_BACKEND_DIGEST" || "$live_sf" != "$WR_OA_STOREFRONT_DIGEST" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MISMATCH"
    wr_owner_approved_audit_denial "$evidence_dir" "OWNER_APPROVAL_MISMATCH" "gate_c live pair != approval"
    return 1
  fi
  if [[ "${WR_OA_RESERVATION_STATE:-legacy}" == "cancelled" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CANCELLED"
    wr_owner_approved_audit_denial "$evidence_dir" "OWNER_APPROVAL_CANCELLED" "gate_c approval was cancelled"
    return 1
  fi
  local expected_cs="${WR_OA_BIND_CHECKSUM:-}"
  if [[ -n "$expected_cs" && "$WR_OA_CHECKSUM" != "$expected_cs" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CHECKSUM_MISMATCH"
    wr_owner_approved_audit_denial "$evidence_dir" "OWNER_APPROVAL_CHECKSUM_MISMATCH" "gate_c checksum != preflight bind"
    return 1
  fi
  if [[ -n "$evidence_dir" ]]; then
    mkdir -p "$evidence_dir/json" 2>/dev/null || true
    printf '%s\n' "$WR_OA_CHECKSUM" >"$evidence_dir/json/owner-approval-checksum-gate_c.txt"
  fi
  WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
  return 0
}

# Rewrite reservation after Gate C. Identity fields stay. Checksum changes.
# Caller already holds the mutation lock. Does not touch containers.
wr_owner_approved_mark_terminal() {
  local environment="$1"
  local terminal_state="$2"
  local evidence_dir="${3:-}"
  local reason="${4:-}"
  case "$terminal_state" in
    committed|rolled_back) ;;
    *)
      WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_MALFORMED"
      return 1
      ;;
  esac
  if ! wr_owner_approved_load "$environment"; then
    return 1
  fi
  if [[ "$WR_OA_RESERVATION_STATE" != "reserved" ]]; then
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
    return 0
  fi
  local previous_cs="$WR_OA_CHECKSUM"
  local previous_gen="$WR_OA_GENERATION"
  local staged
  staged="$(mktemp "${TMPDIR:-/tmp}/wr-oa-terminal.XXXXXX")"
  WR_OA_TRANSITION_AT="${WR_OA_TRANSITION_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  export WR_OA_TRANSITION_AT
  python3 - "$WR_OA_PATH" "$staged" "$terminal_state" "$reason" "$previous_cs" <<'PY' || { rm -f "$staged"; return 1; }
import hashlib, json, os, sys
src, dest, state, reason, previous_cs = sys.argv[1:6]
doc = json.loads(open(src, encoding="utf-8").read())
issued = os.environ.get("WR_OA_TRANSITION_AT") or ""
doc["reservation_state"] = state
doc["reservation_transition_at"] = issued
doc["reservation_transition_reason"] = reason
doc["previous_approval_checksum"] = previous_cs
material = "|".join([
    doc.get("environment", ""),
    doc.get("component") or "pair",
    doc.get("application_sha", ""),
    doc.get("backend_digest", ""),
    doc.get("storefront_digest", ""),
    state,
    previous_cs,
    issued,
])
doc["approval_generation"] = "apr1-" + hashlib.sha256(material.encode()).hexdigest()[:32]
doc["tooling_schema_version"] = "owner-approved-release-v2"
with open(dest, "w", encoding="utf-8") as handle:
    json.dump(doc, handle, indent=2, sort_keys=True)
    handle.write("\n")
    handle.flush()
    os.fsync(handle.fileno())
PY
  local new_cs
  new_cs="$(wr_owner_approved_sha256_file "$staged")"
  if ! wr_owner_approved_atomic_install "$staged" "$WR_OA_PATH" "$new_cs"; then
    rm -f "$staged"
    WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_CAS_MISMATCH"
    return 1
  fi
  rm -f "$staged"
  export WR_OA_PREVIOUS_GENERATION="$previous_gen"
  export WR_OA_ACTOR="${WR_OA_ACTOR:-$(id -un)}"
  wr_owner_approved_load "$environment" || true
  wr_owner_approved_record_transition "$evidence_dir" "$terminal_state" "$previous_cs" "$new_cs" "$reason" || true
  WR_OWNER_APPROVAL_RESULT="OWNER_APPROVAL_OK"
  return 0
}
