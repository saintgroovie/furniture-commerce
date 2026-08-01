#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Cutover helper for the PRIVATE production-candidate stack: dry-run (read-only)
# plus a real, fail-safe execute path with automatic rollback.
#
# NOT a public woodright.ru cutover, NOT a DNS/Traefik/CDN change, and NOT the
# public_demo pair cutover. The only accepted --environment is "production"
# (the private production-candidate stack: ops/config/runtime-environments/
# production.conf, class PRODUCTION_CANDIDATE, WOODRIGHT_PUBLIC_EXPOSURE=
# private). --environment public_demo|staging is explicitly refused here - use
# ops/release/cutover-public-demo-pair.sh (which this script does not modify
# or weaken) for the buyer-facing demo.
#
# Canonical lock (execute only): /srv/woodright/locks/production/live-cutover.lock
# acquired through ops/lib/woodright-staging-mutation-lock.sh (real flock, or
# the helper's fcntl holder fallback). No other lock path is accepted.
#
# TWO DISTINCT SHAs - never conflate them:
#   application_source_sha  = --source-sha, the OCI revision baked into the
#                             candidate images (what actually goes live)
#   helper_install_sha      = the ops commit that installed THIS script
#                             (WOODRIGHT_HELPER_INSTALL_SHA, else
#                             /srv/woodright/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt,
#                             else empty). It is recorded next to - never as -
#                             the release SHA in ACTIVE_*/EXPECTED_RELEASE.
#
# Usage:
#   ops/release/cutover-production-candidate.sh \
#     --environment production \
#     --component storefront|backend|pair \
#     --source-sha <40hex> \
#     [--storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:<64hex>] \
#     [--backend-ref ghcr.io/saintgroovie/woodright-backend@sha256:<64hex>] \
#     [--mode dry-run|execute]                  # default dry-run
#     [--confirm-mutation I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER]
#
# Dry-run (default): read-only.
#   - loads production.conf via ops/lib/woodright-environment-profile.sh
#   - verifies expected container names / binds / lock path from that profile
#   - inspects current containers with `docker inspect` only (never pulls,
#     never recreates)
#   - verifies candidate images' org.opencontainers.image.revision ==
#     --source-sha and woodright.image.build_profile == production_candidate
#   - prints one non-secret JSON packet (including the planned mutation) to
#     stdout and exits 0
#   - holds no lock beyond a brief non-blocking flock probe, writes no pins,
#     writes no ACTIVE_OWNER/EXPECTED_RELEASE files, recreates nothing
#
# Execute: requires --confirm-mutation I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER.
# Phase state machine (persisted in the evidence dir):
#   prepared -> pins_written -> containers_recreated -> health_passed
#            -> acceptance_passed -> committed | rolled_back | failed_before_mutation
# Rollback is armed by the FIRST successful pin write; any P0/P1 after that
# restores pins + keeper containers under the same lock. Never migrations,
# seeds, DNS, public Traefik labels, prune, or postgres/redis recreate.
#
# Exit codes:
#   0 ok | 2 usage/validation | 3 lock | 4 dry-run candidate mismatch
#   10 rollback_ok | 11 rollback_partial | 12 rollback_failed
#
# Fidelity coverage (both run in the PR checks release-governance job):
#   scripts/release/cutover-production-candidate.fidelity.test.cjs - CLI
#     contract + dry-run packet
#   scripts/ops/test-production-candidate-cutover-execute-fidelity.sh - the
#     execute state machine against a /tmp fake filesystem and docker shims
# Operator context: docs/operator/production-candidate-rollback.md
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"
# shellcheck source=../lib/woodright-component-authority.sh
source "$HERE/../lib/woodright-component-authority.sh"
# shellcheck source=../lib/woodright-oci-provenance.sh
source "$HERE/../lib/woodright-oci-provenance.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"

EXECUTE_CONFIRM_TOKEN="I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER"
CANONICAL_LOCK_PATH="/srv/woodright/locks/production/live-cutover.lock"
HELPER_SHA_FILE_DEFAULT="/srv/woodright/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
BUILD_PROFILE_EXPECTED="production_candidate"
# Separator for batched `docker inspect --format` reads. Cannot occur in an
# image ref, container id, label value, or bind spec.
WR_FIELD_SEP="~@~"

MODE="dry-run"
MODE_REQUESTS=""
SOURCE_SHA=""
SF_REF=""
BE_REF=""
CONFIRM=""
MISMATCH=0

HELPER_INSTALL_SHA=""
EVIDENCE_DIR=""
PHASE="init"
COMMITTED=0
ROLLBACK_DONE=0
ROLLBACK_RC=0
PINS_WRITTEN=""
COMPONENTS_RECREATED=""
METADATA_WRITTEN=0
KEEPER_BE=""
KEEPER_SF=""
TS_RUN="$(date -u +%Y%m%dT%H%M%SZ)"
PLANNED_KEEPER_BE=""
PLANNED_KEEPER_SF=""

# All diagnostic/status lines go to stderr; stdout is reserved for the single
# machine-readable JSON packet at the end of a successful run.
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 2; }

usage() {
  cat <<'EOF'
Usage: cutover-production-candidate.sh --environment production --component <storefront|backend|pair> --source-sha <40hex> [options]

Required:
  --environment production        (only "production" accepted; public_demo/staging refused)
  --component storefront|backend|pair
  --source-sha <40hex>            (application OCI revision - NOT the helper install SHA)
  --storefront-ref ghcr.io/...@sha256:<64hex>   (required for storefront|pair)
  --backend-ref ghcr.io/...@sha256:<64hex>      (required for backend|pair)

Optional:
  --mode dry-run|execute      (default dry-run; --dry-run/--execute also accepted)
  --confirm-mutation <token>  (execute only: I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER)

Dry-run: read-only. No lock held, no pin writes, no recreate, no ACTIVE/EXPECTED writes.
Execute: pins -> recreate (backend then storefront, --no-deps) -> health -> ACTIVE,
         under /srv/woodright/locks/production/live-cutover.lock, with automatic
         rollback of pins + keeper containers on any failure after the first pin write.
EOF
}

record_mode_request() {
  case "$MODE_REQUESTS" in
    *"|$1|"*) return 0 ;;
  esac
  MODE_REQUESTS="${MODE_REQUESTS}|$1|"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h) usage; exit 0 ;;
      --environment) shift 2 ;;
      --environment=*) shift ;;
      --component) shift 2 ;;
      --component=*) shift ;;
      --source-sha) SOURCE_SHA="${2:?}"; shift 2 ;;
      --source-sha=*) SOURCE_SHA="${1#--source-sha=}"; shift ;;
      --storefront-ref) SF_REF="${2:?}"; shift 2 ;;
      --storefront-ref=*) SF_REF="${1#--storefront-ref=}"; shift ;;
      --backend-ref) BE_REF="${2:?}"; shift 2 ;;
      --backend-ref=*) BE_REF="${1#--backend-ref=}"; shift ;;
      --mode) MODE="${2:?}"; record_mode_request "$MODE"; shift 2 ;;
      --mode=*) MODE="${1#--mode=}"; record_mode_request "$MODE"; shift ;;
      --dry-run) MODE="dry-run"; record_mode_request dry-run; shift ;;
      --execute) MODE="execute"; record_mode_request execute; shift ;;
      --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
      --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
      *) die "unknown argument: $1" ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Harness overrides. Docker/compose binaries and the evidence dir are ordinary
# operator overrides; fault injection and health/HTTP shortcuts require an
# explicit WOODRIGHT_CUTOVER_HARNESS=1 so a live run can never take them.
# ---------------------------------------------------------------------------
harness_enabled() { [[ "${WOODRIGHT_CUTOVER_HARNESS:-0}" == "1" ]]; }

wr_fault() {
  harness_enabled || return 1
  [[ "${WOODRIGHT_CUTOVER_FAULT:-}" == "$1" ]] || return 1
  log "FAULT_INJECTED name=$1 (harness only)"
  return 0
}

prod_docker() { wr_cutover_docker "$@"; }

prod_compose() {
  local -a cmd=()
  if [[ -n "${WOODRIGHT_COMPOSE_BIN:-}" ]]; then
    IFS=' ' read -r -a cmd <<<"${WOODRIGHT_COMPOSE_BIN}"
  else
    cmd=("${WOODRIGHT_DOCKER_BIN:-docker}" compose)
  fi
  command "${cmd[@]}" "$@"
}

sha256_of() {
  local path="$1"
  [[ -f "$path" ]] || { printf '%s\n' "absent"; return 0; }
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    printf '%s\n' "unknown"
  fi
}

resolve_helper_install_sha() {
  local file="${WOODRIGHT_HELPER_INSTALL_SHA_FILE:-$HELPER_SHA_FILE_DEFAULT}"
  if [[ -n "${WOODRIGHT_HELPER_INSTALL_SHA:-}" ]]; then
    HELPER_INSTALL_SHA="${WOODRIGHT_HELPER_INSTALL_SHA}"
    log "helper_install_sha from env (application_source_sha stays independent)"
    return 0
  fi
  if [[ -r "$file" ]]; then
    HELPER_INSTALL_SHA="$(tr -d '[:space:]' <"$file" 2>/dev/null || true)"
    log "helper_install_sha from $file"
    return 0
  fi
  HELPER_INSTALL_SHA=""
  log "NOTE helper_install_sha unresolved (no WOODRIGHT_HELPER_INSTALL_SHA, no $file) - recorded as empty, never substituted by application_source_sha"
}

# ---------------------------------------------------------------------------
# CLI + environment authority
# ---------------------------------------------------------------------------
FULL_ARGV=("$@")

# --environment / --component are re-validated here on top of the shared
# helpers: wr_require_environment_from_args accepts public_demo|staging|
# production for OTHER tools, but this helper is production-candidate-only
# and must refuse public_demo/staging explicitly.
wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
if [[ "${WOODRIGHT_ENVIRONMENT}" != "production" ]]; then
  die "refused --environment '${WOODRIGHT_ENVIRONMENT}' (only 'production' accepted here - this is the private production-candidate stack, never public_demo/staging; use ops/release/cutover-public-demo-pair.sh for public_demo)"
fi
wr_require_component_from_args "${FULL_ARGV[@]}" || die "missing required --component <storefront|backend|pair>"
COMPONENT="${WOODRIGHT_COMPONENT_SCOPE}"

parse_args "${FULL_ARGV[@]}"

case "$MODE_REQUESTS" in
  *"|dry-run|"*)
    case "$MODE_REQUESTS" in
      *"|execute|"*) die "refused conflicting modes: --dry-run and --execute requested together" ;;
    esac
    ;;
esac
case "$MODE" in
  dry-run|execute) ;;
  *) die "invalid --mode '$MODE' (expected dry-run|execute)" ;;
esac

if [[ "$MODE" == "execute" ]]; then
  wr_cutover_require_confirm_token "$EXECUTE_CONFIRM_TOKEN" "$CONFIRM" || exit 2
elif [[ -n "$CONFIRM" ]]; then
  die "--confirm-mutation is only valid with --mode execute"
fi

wr_cutover_require_full_sha "$SOURCE_SHA" || exit 2
resolve_helper_install_sha

# Belt-and-braces: this helper must never be pointed at a public_demo/staging
# -named container even if a profile/env var were ever mixed up upstream.
# (wr_cutover_refuse_production_name from woodright-cutover-common.sh is for
# the OPPOSITE direction - public_demo scripts refusing production names -
# and does not apply here, since this helper's whole purpose IS production.)
assert_not_public_demo_name() {
  local what="$1" value="$2"
  case "$value" in
    *staging*|*public-demo*|*public_demo*)
      die "refused non-production ${what}: ${value}"
      ;;
  esac
}
assert_not_public_demo_name "container name for backend" "${WOODRIGHT_BE_CONTAINER_DEFAULT}"
assert_not_public_demo_name "container name for storefront" "${WOODRIGHT_SF_CONTAINER_DEFAULT}"

wr_assert_environment_provisioned || exit 1
wr_prelock_validate_environment_target || exit 1

need_sf() { [[ "$COMPONENT" == "storefront" || "$COMPONENT" == "pair" ]]; }
need_be() { [[ "$COMPONENT" == "backend" || "$COMPONENT" == "pair" ]]; }

IMAGE_REGISTRY="${WOODRIGHT_IMAGE_REGISTRY:-ghcr.io/saintgroovie}"
assert_ref_repository() {
  # Registry/repository authority comes from the loaded production profile
  # (image titles) - never from an operator-supplied arbitrary repo.
  local kind="$1" ref="$2" title="$3"
  local want="${IMAGE_REGISTRY%/}/${title}@"
  [[ "$ref" == "${want}"* ]] || die "refused $kind ref '$ref' (expected ${want}sha256:<64hex> from the production profile)"
}

if need_sf; then
  [[ -n "$SF_REF" ]] || die "--storefront-ref required for --component $COMPONENT"
  wr_cutover_require_digest "${SF_REF##*@}" || exit 2
  wr_cutover_require_image_at_digest "$SF_REF" "${SF_REF##*@}" || exit 2
  assert_ref_repository storefront "$SF_REF" "${WOODRIGHT_REQUIRED_SF_TITLE:-woodright-storefront}"
fi
if need_be; then
  [[ -n "$BE_REF" ]] || die "--backend-ref required for --component $COMPONENT"
  wr_cutover_require_digest "${BE_REF##*@}" || exit 2
  wr_cutover_require_image_at_digest "$BE_REF" "${BE_REF##*@}" || exit 2
  assert_ref_repository backend "$BE_REF" "${WOODRIGHT_REQUIRED_BE_TITLE:-woodright-backend}"
fi
if need_sf && need_be; then
  [[ "${SF_REF##*@}" != "${BE_REF##*@}" ]] || die "backend and storefront digests must differ"
fi

# ---------------------------------------------------------------------------
# Shared read-only inspection (used by both modes)
# ---------------------------------------------------------------------------

# Brief, non-blocking flock probe - never held beyond this check, never
# acquired via the shared mutation-lock helper (which would install EXIT
# traps and hold it for the process lifetime; a dry-run must not do that).
check_lock_status() {
  local lock_path="${WOODRIGHT_MUTATION_LOCK_PATH:-}"
  WR_LOCK_STATUS="unknown"
  if [[ -z "$lock_path" ]]; then
    return 0
  fi
  if [[ ! -e "$lock_path" ]]; then
    WR_LOCK_STATUS="lock_path_absent"
    return 0
  fi
  if ! command -v flock >/dev/null 2>&1; then
    WR_LOCK_STATUS="flock_unavailable"
    return 0
  fi
  # Append-open an EXISTING lock file only. Never truncate (`>` would wipe
  # operator notes) and never create the lock (file already proven to exist
  # above). Brief non-blocking flock probe, then release immediately.
  WR_LOCK_STATUS="free"
  exec 219>>"$lock_path" 2>/dev/null || { WR_LOCK_STATUS="lock_path_unreachable"; return 0; }
  if flock -n 219; then
    flock -u 219 || true
  else
    WR_LOCK_STATUS="held_by_other_process"
  fi
  exec 219>&- 2>/dev/null || true
}

# Read-only image candidate inspection - never pulls.
inspect_image_candidate() {
  local kind="$1" ref="$2"
  local present="false" revision="" profile_label=""
  if prod_docker image inspect "$ref" >/dev/null 2>&1; then
    present="true"
    revision="$(prod_docker image inspect "$ref" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
    profile_label="$(prod_docker image inspect "$ref" --format '{{index .Config.Labels "woodright.image.build_profile"}}' 2>/dev/null || true)"
    if [[ -z "$revision" ]]; then
      log "MISMATCH $kind ref=$ref oci_revision missing (fail-closed when image is present)"
      MISMATCH=1
    elif [[ "$revision" != "$SOURCE_SHA" ]]; then
      log "MISMATCH $kind ref=$ref oci_revision=$revision expected=$SOURCE_SHA"
      MISMATCH=1
    fi
    if [[ -z "$profile_label" ]]; then
      log "MISMATCH $kind ref=$ref woodright.image.build_profile label missing (fail-closed when image is present)"
      MISMATCH=1
    elif [[ "$profile_label" != "$BUILD_PROFILE_EXPECTED" ]]; then
      log "MISMATCH $kind ref=$ref build_profile=$profile_label expected=$BUILD_PROFILE_EXPECTED"
      MISMATCH=1
    fi
  else
    log "NOTE $kind image not present locally (never pulls) - not verified: $ref"
  fi
  eval "WR_${kind}_PRESENT=\"$present\""
  eval "WR_${kind}_REVISION=\"$revision\""
  eval "WR_${kind}_BUILD_PROFILE=\"$profile_label\""
  eval "WR_${kind}_REF=\"$ref\""
}

# Read-only container inspection - never mutates.
inspect_container() {
  local kind="$1" name="$2"
  if ! prod_docker inspect "$name" >/dev/null 2>&1; then
    eval "WR_${kind}_CONTAINER_PRESENT=false"
    log "NOTE $kind container '$name' not found locally (read-only inspect; nothing mutated)"
    return 0
  fi
  eval "WR_${kind}_CONTAINER_PRESENT=true"
  # One inspect call for every field we need: fewer daemon round-trips, and a
  # single consistent snapshot instead of seven interleaved ones.
  local blob fields=()
  blob="$(prod_docker inspect "$name" --format \
    "{{.Id}}${WR_FIELD_SEP}{{.Config.Image}}${WR_FIELD_SEP}{{.RestartCount}}${WR_FIELD_SEP}{{index .Config.Labels \"com.woodright.runtime-role\"}}${WR_FIELD_SEP}{{index .Config.Labels \"com.woodright.deployment-owner\"}}${WR_FIELD_SEP}{{index .Config.Labels \"traefik.enable\"}}${WR_FIELD_SEP}{{json .HostConfig.Binds}}" \
    2>/dev/null || true)"
  local line
  while IFS= read -r line; do fields+=("$line"); done <<<"${blob//${WR_FIELD_SEP}/$'\n'}"
  eval "WR_${kind}_CONTAINER_ID=\"${fields[0]-}\""
  eval "WR_${kind}_CONTAINER_IMAGE=\"${fields[1]-}\""
  eval "WR_${kind}_CONTAINER_RESTARTS=\"${fields[2]-}\""
  eval "WR_${kind}_CONTAINER_ROLE_LABEL=\"${fields[3]-}\""
  eval "WR_${kind}_CONTAINER_OWNER_LABEL=\"${fields[4]-}\""
  local traefik_enable="${fields[5]-}"
  eval "WR_${kind}_TRAEFIK_ENABLE=\"$traefik_enable\""
  if [[ "$traefik_enable" == "true" ]]; then
    log "WARN $kind container '$name' has traefik.enable=true - unexpected for a private production-candidate stack"
  fi
  local binds="${fields[6]-}"
  [[ -n "$binds" ]] || binds='[]'
  eval "WR_${kind}_CONTAINER_BINDS='$binds'"
}

container_digest() {
  local name="$1" blob=""
  blob="$(prod_docker inspect "$name" --format '{{.Config.Image}}' 2>/dev/null || true)"
  local found
  found="$(printf '%s' "$blob" | grep -oE 'sha256:[0-9a-f]{64}' | head -1 || true)"
  if [[ -z "$found" ]]; then
    blob="$(prod_docker inspect "$name" --format '{{json .RepoDigests}}' 2>/dev/null || true)"
    found="$(printf '%s' "$blob" | grep -oE 'sha256:[0-9a-f]{64}' | head -1 || true)"
  fi
  printf '%s\n' "$found"
}

container_id() { prod_docker inspect "$1" --format '{{.Id}}' 2>/dev/null || true; }

host_port_of() {
  # http://127.0.0.1:9200 -> 9200
  local url="$1"
  printf '%s\n' "${url##*:}" | tr -d '/'
}

assert_loopback_host() {
  local what="$1" url="$2"
  case "$url" in
    http://127.0.0.1:*|http://localhost:*) return 0 ;;
    *) die "refused non-loopback $what '$url' - the production candidate stays private" ;;
  esac
}

assert_private_binds() {
  local name="$1" want_port="$2"
  local bindings
  bindings="$(prod_docker inspect "$name" --format '{{json .HostConfig.PortBindings}}' 2>/dev/null || true)"
  [[ -n "$bindings" && "$bindings" != "<no value>" ]] || bindings="null"
  python3 - "$name" "$bindings" "${WOODRIGHT_ALLOWED_HOST_BIND_PREFIX:-127.0.0.1:}" "$want_port" <<'PY'
import json, sys
name, raw, prefix, want_port = sys.argv[1:5]
allowed_ip = prefix.rstrip(":") or "127.0.0.1"
try:
    data = json.loads(raw)
except Exception:
    data = None
data = data or {}
offenders = []
found_want = False
for container_port, binds in data.items():
    for b in binds or []:
        host_ip = (b or {}).get("HostIp") or ""
        host_port = str((b or {}).get("HostPort") or "")
        if host_ip not in (allowed_ip,):
            offenders.append(f"{container_port}->{host_ip or '0.0.0.0'}:{host_port}")
        if host_port == want_port and host_ip == allowed_ip:
            found_want = True
if offenders:
    print(f"PUBLIC_BIND {name} {' '.join(offenders)}")
    sys.exit(1)
if not found_want:
    print(f"MISSING_PRIVATE_BIND {name} expected {allowed_ip}:{want_port}")
    sys.exit(1)
print(f"private_bind_ok {name} {allowed_ip}:{want_port}")
PY
}

assert_no_public_traefik() {
  local name="$1"
  local labels
  labels="$(prod_docker inspect "$name" --format '{{json .Config.Labels}}' 2>/dev/null || true)"
  [[ -n "$labels" && "$labels" != "<no value>" ]] || labels="null"
  python3 - "$name" "$labels" "${WOODRIGHT_FORBIDDEN_DOMAINS:-}" <<'PY'
import json, sys
name, raw, forbidden_raw = sys.argv[1:4]
try:
    labels = json.loads(raw)
except Exception:
    labels = None
labels = labels or {}
forbidden = [d.strip() for d in forbidden_raw.split(",") if d.strip()]
problems = []
if str(labels.get("traefik.enable", "")).lower() == "true":
    problems.append("traefik.enable=true")
for key, value in labels.items():
    text = f"{key}={value}"
    if key.startswith("traefik.") and "Host(" in str(value):
        problems.append(f"traefik router rule {key}")
    for domain in forbidden:
        if domain and domain in str(value):
            problems.append(f"forbidden domain {domain} in {key}")
if problems:
    print(f"PUBLIC_EXPOSURE {name} " + "; ".join(sorted(set(problems))))
    sys.exit(1)
print(f"private_exposure_ok {name}")
PY
}

assert_media_volume() {
  local vol="${WOODRIGHT_MEDIA_VOLUME:-}"
  [[ -n "$vol" ]] || die "profile is missing WOODRIGHT_MEDIA_VOLUME"
  prod_docker volume inspect "$vol" >/dev/null 2>&1 \
    || die "required media volume missing: $vol (refusing to mutate a stack whose media volume is absent)"
  local mounts
  mounts="$(prod_docker inspect "${WOODRIGHT_BE_CONTAINER_DEFAULT}" --format '{{json .Mounts}}' 2>/dev/null || true)"
  [[ -n "$mounts" && "$mounts" != "<no value>" ]] || mounts="[]"
  python3 - "$vol" "${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}" "$mounts" <<'PY'
import json, sys
vol, mount_point, raw = sys.argv[1:4]
try:
    mounts = json.loads(raw)
except Exception:
    mounts = []
for m in mounts or []:
    if (m.get("Name") == vol) and (m.get("Destination") == mount_point):
        print(f"media_volume_ok {vol} -> {mount_point}")
        sys.exit(0)
print(f"MEDIA_VOLUME_NOT_MOUNTED {vol} expected at {mount_point}")
sys.exit(1)
PY
}

# ---------------------------------------------------------------------------
# Dry-run path (read-only from here on)
# ---------------------------------------------------------------------------
COMPOSE_ENV_FILE="${WOODRIGHT_CUTOVER_COMPOSE_ENV:-${WOODRIGHT_COMPOSE_ENV_FILE:-}}"
[[ -n "$COMPOSE_ENV_FILE" ]] || die "profile is missing WOODRIGHT_COMPOSE_ENV_FILE"
assert_not_public_demo_name "compose env file" "$COMPOSE_ENV_FILE"
assert_not_public_demo_name "ownership dir" "${WOODRIGHT_OWNERSHIP_DIR:-}"

BE_PORT="$(host_port_of "${WOODRIGHT_API_HOST}")"
SF_PORT="$(host_port_of "${WOODRIGHT_BUYER_HOST}")"
assert_loopback_host "api host" "${WOODRIGHT_API_HOST}"
assert_loopback_host "buyer host" "${WOODRIGHT_BUYER_HOST}"

if need_sf; then inspect_image_candidate SF "$SF_REF"; else WR_SF_PRESENT=n_a; WR_SF_REVISION=""; WR_SF_BUILD_PROFILE=""; WR_SF_REF=""; fi
if need_be; then inspect_image_candidate BE "$BE_REF"; else WR_BE_PRESENT=n_a; WR_BE_REVISION=""; WR_BE_BUILD_PROFILE=""; WR_BE_REF=""; fi

inspect_container BE "${WOODRIGHT_BE_CONTAINER_DEFAULT}"
inspect_container SF "${WOODRIGHT_SF_CONTAINER_DEFAULT}"

if need_be; then PLANNED_KEEPER_BE="${WOODRIGHT_BE_CONTAINER_DEFAULT}-keeper-${TS_RUN}"; fi
if need_sf; then PLANNED_KEEPER_SF="${WOODRIGHT_SF_CONTAINER_DEFAULT}-keeper-${TS_RUN}"; fi

emit_packet() {
  local packet_mode="$1" verdict="$2"
  export WR_LOCK_STATUS WR_SF_PRESENT WR_SF_REVISION WR_SF_BUILD_PROFILE WR_SF_REF \
    WR_BE_PRESENT WR_BE_REVISION WR_BE_BUILD_PROFILE WR_BE_REF \
    WR_BE_CONTAINER_PRESENT WR_SF_CONTAINER_PRESENT \
    WR_BE_CONTAINER_ID WR_SF_CONTAINER_ID WR_BE_CONTAINER_IMAGE WR_SF_CONTAINER_IMAGE \
    WR_BE_CONTAINER_RESTARTS WR_SF_CONTAINER_RESTARTS \
    WR_BE_CONTAINER_ROLE_LABEL WR_SF_CONTAINER_ROLE_LABEL \
    WR_BE_CONTAINER_OWNER_LABEL WR_SF_CONTAINER_OWNER_LABEL \
    WR_BE_TRAEFIK_ENABLE WR_SF_TRAEFIK_ENABLE \
    WR_BE_CONTAINER_BINDS WR_SF_CONTAINER_BINDS
  WR_PACKET_HELPER_SHA="$HELPER_INSTALL_SHA" \
  WR_PACKET_EVIDENCE_DIR="$EVIDENCE_DIR" \
  WR_PACKET_PHASE="$PHASE" \
  WR_PACKET_VERDICT="$verdict" \
  WR_PACKET_COMPOSE_ENV="$COMPOSE_ENV_FILE" \
  WR_PACKET_COMPOSE_FILE="${WOODRIGHT_COMPOSE_FILE:-}" \
  WR_PACKET_COMPOSE_PROJECT="${WOODRIGHT_COMPOSE_PROJECT:-}" \
  WR_PACKET_OWNERSHIP_DIR="${WOODRIGHT_OWNERSHIP_DIR:-}" \
  WR_PACKET_API_HOST="${WOODRIGHT_API_HOST:-}" \
  WR_PACKET_BUYER_HOST="${WOODRIGHT_BUYER_HOST:-}" \
  WR_PACKET_KEEPERS="${PLANNED_KEEPER_BE}|${PLANNED_KEEPER_SF}" \
  python3 - "$WOODRIGHT_ENVIRONMENT" "$WOODRIGHT_ENVIRONMENT_CLASS" "$COMPONENT" "$SOURCE_SHA" "$packet_mode" \
    "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "${WOODRIGHT_SF_CONTAINER_DEFAULT}" \
    "${WOODRIGHT_MUTATION_LOCK_PATH:-}" <<'PY'
import json
import os
import sys

(
    environment,
    environment_class,
    component,
    source_sha,
    mode,
    be_container,
    sf_container,
    lock_path,
) = sys.argv[1:9]

need_be = component in ("backend", "pair")
need_sf = component in ("storefront", "pair")
verdict = os.environ.get("WR_PACKET_VERDICT", "")


def image_block(prefix):
    present = os.environ.get(f"WR_{prefix}_PRESENT", "")
    if present == "n_a":
        return {"applicable": False}
    revision = os.environ.get(f"WR_{prefix}_REVISION", "")
    profile_label = os.environ.get(f"WR_{prefix}_BUILD_PROFILE", "")
    return {
        "applicable": True,
        "ref": os.environ.get(f"WR_{prefix}_REF", ""),
        "present_locally": present == "true",
        "oci_revision": revision,
        "build_profile_label": profile_label,
        "revision_matches_source_sha": (revision == source_sha) if revision else None,
        "build_profile_is_production_candidate": (
            (profile_label == "production_candidate") if profile_label else None
        ),
    }


def container_block(prefix, name):
    present = os.environ.get(f"WR_{prefix}_CONTAINER_PRESENT", "false") == "true"
    block = {"name": name, "present": present}
    if present:
        binds_raw = os.environ.get(f"WR_{prefix}_CONTAINER_BINDS", "[]")
        try:
            binds = json.loads(binds_raw) if binds_raw else []
        except Exception:
            binds = binds_raw
        block.update(
            {
                "id": os.environ.get(f"WR_{prefix}_CONTAINER_ID", ""),
                "image": os.environ.get(f"WR_{prefix}_CONTAINER_IMAGE", ""),
                "restart_count": os.environ.get(f"WR_{prefix}_CONTAINER_RESTARTS", ""),
                "runtime_role_label": os.environ.get(f"WR_{prefix}_CONTAINER_ROLE_LABEL", ""),
                "deployment_owner_label": os.environ.get(f"WR_{prefix}_CONTAINER_OWNER_LABEL", ""),
                "traefik_enable_label": os.environ.get(f"WR_{prefix}_TRAEFIK_ENABLE", "") or "<absent>",
                "binds": binds,
            }
        )
    return block


pin_keys = {}
if need_be:
    pin_keys["WOODRIGHT_BACKEND_IMAGE"] = os.environ.get("WR_BE_REF", "")
if need_sf:
    pin_keys["WOODRIGHT_STOREFRONT_IMAGE"] = os.environ.get("WR_SF_REF", "")

recreate_order = [c for c in ("backend", "storefront") if (c == "backend" and need_be) or (c == "storefront" and need_sf)]

keep_be, _, keep_sf = os.environ.get("WR_PACKET_KEEPERS", "|").partition("|")

packet = {
    "tool": "cutover-production-candidate.sh",
    "mode": mode,
    "environment": environment,
    "environment_class": environment_class,
    "component": component,
    "source_sha": source_sha,
    "application_source_sha": source_sha,
    "helper_install_sha": os.environ.get("WR_PACKET_HELPER_SHA", ""),
    "sha_separation_note": (
        "application_source_sha is the OCI revision of the images; "
        "helper_install_sha is the ops commit that installed this script; "
        "they are recorded separately and never substituted for each other"
    ),
    "mutation_lock_path": lock_path,
    "mutation_lock_status": os.environ.get("WR_LOCK_STATUS", "unknown"),
    "candidates": {
        "backend": image_block("BE"),
        "storefront": image_block("SF"),
    },
    "current_containers": {
        "backend": container_block("BE", be_container),
        "storefront": container_block("SF", sf_container),
    },
    "planned_mutation": {
        "pin_plan": {
            "compose_env_file": os.environ.get("WR_PACKET_COMPOSE_ENV", ""),
            "keys": pin_keys,
            "write_order": [k for k in ("WOODRIGHT_BACKEND_IMAGE", "WOODRIGHT_STOREFRONT_IMAGE") if k in pin_keys],
            "atomic": "tmp on same filesystem, validated, then installed",
        },
        "recreate": {
            "order": recreate_order,
            "compose_file": os.environ.get("WR_PACKET_COMPOSE_FILE", ""),
            "compose_project": os.environ.get("WR_PACKET_COMPOSE_PROJECT", ""),
            "flags": ["up", "-d", "--no-deps"],
            "never_recreated": ["postgres", "redis"],
        },
        "rollback_refs": {
            "backend_container_id": os.environ.get("WR_BE_CONTAINER_ID", ""),
            "backend_image": os.environ.get("WR_BE_CONTAINER_IMAGE", ""),
            "storefront_container_id": os.environ.get("WR_SF_CONTAINER_ID", ""),
            "storefront_image": os.environ.get("WR_SF_CONTAINER_IMAGE", ""),
            "pin_backup": "evidence/pin-backup/dokploy-compose.env",
            "keeper_names": {"backend": keep_be, "storefront": keep_sf},
        },
        "health_plan": {
            "docker_health": recreate_order,
            "http": [
                f"{os.environ.get('WR_PACKET_API_HOST', '').rstrip('/')}/health",
                f"{os.environ.get('WR_PACKET_BUYER_HOST', '').rstrip('/')}/",
            ],
        },
        "ownership_targets": {
            "dir": os.environ.get("WR_PACKET_OWNERSHIP_DIR", ""),
            "files": ["ACTIVE_OWNER.json", "EXPECTED_RELEASE.json", "ACTIVE_RELEASE.json"],
            "release_sha_field": "application_source_sha",
        },
        "state_machine": [
            "prepared",
            "pins_written",
            "containers_recreated",
            "health_passed",
            "acceptance_passed",
            "committed|rolled_back|failed_before_mutation",
        ],
    },
    "no_migrations": True,
    "no_seeds": True,
    "no_dns_change": True,
    "no_public_traefik_change": True,
}

if mode == "dry-run":
    packet.update(
        {
            "no_mutation_performed": True,
            "no_lock_held": True,
            "no_pin_writes": True,
        }
    )
else:
    packet.update(
        {
            "phase": os.environ.get("WR_PACKET_PHASE", ""),
            "verdict": verdict,
            "evidence_dir": os.environ.get("WR_PACKET_EVIDENCE_DIR", ""),
            "no_mutation_performed": False,
            "no_lock_held": False,
            "no_pin_writes": False,
        }
    )

print(json.dumps(packet, indent=2, sort_keys=True))
PY
}

if [[ "$MODE" == "dry-run" ]]; then
  check_lock_status
  emit_packet dry-run planned
  if [[ "$MISMATCH" -eq 1 ]]; then
    log "DRY_RUN_MISMATCH sha=$SOURCE_SHA component=$COMPONENT - a locally present candidate image does not match the requested source-sha/profile"
    exit 4
  fi
  log "DRY_RUN_OK environment=production component=$COMPONENT sha=$SOURCE_SHA helper_install_sha=${HELPER_INSTALL_SHA:-<unset>} (read-only; no lock held, no pins written, no containers touched)"
  exit 0
fi

# ===========================================================================
# EXECUTE
# ===========================================================================

[[ "$MISMATCH" -eq 0 ]] || die "candidate image mismatch - refusing execute (see MISMATCH lines above)"

record_state() {
  PHASE="$1"
  [[ -n "$EVIDENCE_DIR" && -d "$EVIDENCE_DIR" ]] || return 0
  printf '%s\n' "$PHASE" >"$EVIDENCE_DIR/state.txt"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PHASE" >>"$EVIDENCE_DIR/state-transitions.log"
  log "STATE $PHASE"
}

rollback_armed() {
  case "$PHASE" in
    pins_written|containers_recreated|health_passed|acceptance_passed) return 0 ;;
    *) return 1 ;;
  esac
}

release_lock() { wr_staging_mutation_lock_release || true; }

# Atomic same-filesystem publish: sibling copy then mv -f. Never truncate-in-place via cp.
# Direct (non-sudo) path requires the DESTINATION DIRECTORY to be writable so the
# sibling temp can be created beside the live file. Writable dest file alone is
# not enough (Dokploy layouts often make the file writable while the dir is root-owned).
prod_atomic_install() {
  local src="${1:?}" dest="${2:?}"
  local dir published
  [[ -f "$src" ]] || return 1
  dir="$(dirname "$dest")"
  published="${dest}.wr-prod-new-$$"
  if [[ -d "$dir" && -w "$dir" ]]; then
    cp -p "$src" "$published" || return 1
    mv -f "$published" "$dest" || { rm -f "$published"; return 1; }
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n cp -p "$src" "$published" || return 1
    sudo -n mv -f "$published" "$dest" || { sudo -n rm -f "$published" 2>/dev/null || true; return 1; }
    return 0
  fi
  log "cannot atomically install $src -> $dest (dir not writable and no sudo -n)"
  return 1
}

restore_pins() {
  local backup="$EVIDENCE_DIR/pin-backup/dokploy-compose.env"
  [[ -f "$backup" ]] || { log "ROLLBACK no pin backup to restore"; return 0; }
  if prod_atomic_install "$backup" "$COMPOSE_ENV_FILE"; then
    log "ROLLBACK pins restored -> $COMPOSE_ENV_FILE"
    return 0
  fi
  log "ROLLBACK pin restore FAILED -> $COMPOSE_ENV_FILE"
  return 1
}

restore_ownership_metadata() {
  local rc=0 name dest backup created_list
  created_list="$EVIDENCE_DIR/json/ownership-created.txt"
  for name in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
    dest="${WOODRIGHT_OWNERSHIP_DIR%/}/$name"
    backup="$EVIDENCE_DIR/pin-backup/$name"
    if [[ -f "$backup" ]]; then
      prod_atomic_install "$backup" "$dest" || rc=1
      continue
    fi
    # File did not exist before mutation - remove any partial create.
    if [[ -f "$created_list" ]] && grep -Fxq "$name" "$created_list" 2>/dev/null; then
      if [[ -e "$dest" ]]; then
        rm -f "$dest" 2>/dev/null || sudo -n rm -f "$dest" 2>/dev/null || rc=1
      fi
    fi
  done
  return "$rc"
}

restore_component_from_keeper() {
  local kind="$1"
  local name keeper
  if [[ "$kind" == "backend" ]]; then
    name="${WOODRIGHT_BE_CONTAINER_DEFAULT}"; keeper="$KEEPER_BE"
  else
    name="${WOODRIGHT_SF_CONTAINER_DEFAULT}"; keeper="$KEEPER_SF"
  fi
  if [[ -z "$keeper" ]] || ! prod_docker inspect "$keeper" >/dev/null 2>&1; then
    log "ROLLBACK $kind: no keeper to restore (nothing was renamed aside)"
    return 0
  fi
  if prod_docker inspect "$name" >/dev/null 2>&1; then
    # Preserve the failed container for forensics instead of removing it.
    prod_docker stop "$name" >/dev/null 2>&1 || true
    prod_docker rename "$name" "${name}-failed-${TS_RUN}" >/dev/null 2>&1 || {
      log "ROLLBACK $kind: cannot move failed container aside"
      return 1
    }
  fi
  prod_docker rename "$keeper" "$name" >/dev/null 2>&1 || {
    log "ROLLBACK $kind: keeper rename back FAILED ($keeper -> $name)"
    return 1
  }
  prod_docker start "$name" >/dev/null 2>&1 || {
    log "ROLLBACK $kind: keeper start FAILED ($name)"
    return 1
  }
  log "ROLLBACK $kind restored from keeper $keeper"
  return 0
}

run_rollback() {
  if [[ "$ROLLBACK_DONE" == "1" ]]; then
    log "ROLLBACK already performed - not repeating"
    return "$ROLLBACK_RC"
  fi
  ROLLBACK_DONE=1
  log "ROLLBACK begin phase=$PHASE recreated=[${COMPONENTS_RECREATED# }]"
  local pin_ok=1 sf_ok=1 be_ok=1 meta_ok=1
  # Keeper-driven, not success-driven: a component whose recreate failed
  # mid-flight has already been renamed aside and must be restored too.
  # Storefront first (reverse of the recreate order), then backend.
  [[ -z "$KEEPER_SF" ]] || restore_component_from_keeper storefront || sf_ok=0
  [[ -z "$KEEPER_BE" ]] || restore_component_from_keeper backend || be_ok=0
  restore_pins || pin_ok=0
  if [[ "$METADATA_WRITTEN" == "1" ]]; then
    restore_ownership_metadata || meta_ok=0
  fi
  if [[ -n "$EVIDENCE_DIR" && -d "$EVIDENCE_DIR/json" ]]; then
    printf '{"phase_at_rollback":"%s","backend":%s,"storefront":%s,"pins":%s,"metadata":%s}\n' \
      "$PHASE" "$be_ok" "$sf_ok" "$pin_ok" "$meta_ok" >"$EVIDENCE_DIR/json/rollback-result.json"
  fi
  if [[ "$be_ok" == "1" && "$sf_ok" == "1" && "$pin_ok" == "1" && "$meta_ok" == "1" ]]; then
    ROLLBACK_RC=10
    log "ROLLBACK_OK"
  elif [[ "$be_ok" == "1" || "$sf_ok" == "1" || "$pin_ok" == "1" ]]; then
    ROLLBACK_RC=11
    log "ROLLBACK_PARTIAL"
  else
    ROLLBACK_RC=12
    log "ROLLBACK_FAILED"
  fi
  record_state rolled_back
  return "$ROLLBACK_RC"
}

prod_on_exit() {
  local rc=$?
  # Disarm every trap first: rollback must never re-enter itself, and a
  # successful commit must never be undone by a late signal.
  trap - EXIT INT TERM HUP
  if [[ "$COMMITTED" == "1" || "$ROLLBACK_DONE" == "1" ]]; then
    release_lock
    exit "$rc"
  fi
  if rollback_armed; then
    run_rollback || true
    rc="${ROLLBACK_RC:-12}"
  else
    record_state failed_before_mutation
  fi
  release_lock
  exit "$rc"
}

prod_on_signal() {
  local sig="$1" rc="$2"
  log "SIGNAL $sig received phase=$PHASE - fail-safe path engaged"
  exit "$rc"
}

# --- candidates/targets must be fully valid before we take the lock ---------
[[ -f "$COMPOSE_ENV_FILE" ]] || die "compose env file missing: $COMPOSE_ENV_FILE"
[[ -n "${WOODRIGHT_COMPOSE_FILE:-}" && -f "${WOODRIGHT_COMPOSE_FILE}" ]] \
  || die "compose file missing: ${WOODRIGHT_COMPOSE_FILE:-<unset>}"
[[ -n "${WOODRIGHT_COMPOSE_PROJECT:-}" ]] || die "profile is missing WOODRIGHT_COMPOSE_PROJECT"

if need_be; then
  [[ "$WR_BE_PRESENT" == "true" ]] || die "backend candidate image not present locally (execute never pulls): $BE_REF"
  [[ "$WR_BE_CONTAINER_PRESENT" == "true" ]] || die "backend container missing: ${WOODRIGHT_BE_CONTAINER_DEFAULT}"
fi
if need_sf; then
  [[ "$WR_SF_PRESENT" == "true" ]] || die "storefront candidate image not present locally (execute never pulls): $SF_REF"
  [[ "$WR_SF_CONTAINER_PRESENT" == "true" ]] || die "storefront container missing: ${WOODRIGHT_SF_CONTAINER_DEFAULT}"
fi

wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend \
  || die "backend container does not match the production profile"
wr_assert_container_matches_environment "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront \
  || die "storefront container does not match the production profile"

assert_private_binds "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "$BE_PORT" >&2 || die "backend bind is not private"
assert_private_binds "${WOODRIGHT_SF_CONTAINER_DEFAULT}" "$SF_PORT" >&2 || die "storefront bind is not private"
assert_no_public_traefik "${WOODRIGHT_BE_CONTAINER_DEFAULT}" >&2 || die "backend carries public Traefik exposure"
assert_no_public_traefik "${WOODRIGHT_SF_CONTAINER_DEFAULT}" >&2 || die "storefront carries public Traefik exposure"
assert_media_volume >&2 || die "media volume gate failed"

if [[ "${WOODRIGHT_PENDING_MIGRATION:-0}" == "1" ]]; then
  die "pending migration flagged (WOODRIGHT_PENDING_MIGRATION=1) - this helper is image-only and never migrates"
fi

PRELOCK_BE_ID="$(container_id "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
PRELOCK_SF_ID="$(container_id "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
PRELOCK_BE_DIGEST="$(container_digest "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
PRELOCK_SF_DIGEST="$(container_digest "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
PRELOCK_PIN_SHA="$(sha256_of "$COMPOSE_ENV_FILE")"

# --- lock -------------------------------------------------------------------
if [[ "${WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL:-0}" == "1" ]]; then
  case "$WR_STAGING_MUTATION_LOCK_PATH" in
    */locks/production/live-cutover.lock) ;;
    *) die "refused lock path '$WR_STAGING_MUTATION_LOCK_PATH' (harness must still end in /locks/production/live-cutover.lock)" ;;
  esac
else
  [[ "$WR_STAGING_MUTATION_LOCK_PATH" == "$CANONICAL_LOCK_PATH" ]] \
    || die "refused lock path '$WR_STAGING_MUTATION_LOCK_PATH' (production cutover locks only $CANONICAL_LOCK_PATH)"
fi

# The lock library is sourced before the profile is loaded, so its cached dir
# still points at the library default; re-derive it from the profile path.
WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_PATH}.meta"

WOODRIGHT_TARGET_SHA="$SOURCE_SHA" \
wr_staging_mutation_lock_acquire \
  "actor=cutover-production-candidate" \
  "command=$0 --environment production --component $COMPONENT --mode execute" \
  "target=application_source_sha=${SOURCE_SHA} helper_install_sha=${HELPER_INSTALL_SHA:-none}" \
  || exit 3

# Own the traps from here: the lock helper's handlers release the lock before
# chaining, which would run rollback unlocked. Ours roll back first and then
# release the same lock explicitly.
trap 'prod_on_exit' EXIT
trap 'prod_on_signal INT 130' INT
trap 'prod_on_signal TERM 143' TERM
trap 'prod_on_signal HUP 129' HUP

log "lock held path=$WR_STAGING_MUTATION_LOCK_PATH"

# --- under-lock freeze ------------------------------------------------------
wr_prelock_validate_environment_target || die "under-lock environment retarget detected"
wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend || die "under-lock backend retarget"
wr_assert_container_matches_environment "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront || die "under-lock storefront retarget"

UNDER_BE_ID="$(container_id "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
UNDER_SF_ID="$(container_id "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
UNDER_BE_DIGEST="$(container_digest "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
UNDER_SF_DIGEST="$(container_digest "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
UNDER_PIN_SHA="$(sha256_of "$COMPOSE_ENV_FILE")"
[[ "$UNDER_BE_ID" == "$PRELOCK_BE_ID" ]] || die "TOCTOU backend container id changed pre=$PRELOCK_BE_ID under=$UNDER_BE_ID"
[[ "$UNDER_SF_ID" == "$PRELOCK_SF_ID" ]] || die "TOCTOU storefront container id changed pre=$PRELOCK_SF_ID under=$UNDER_SF_ID"
[[ "$UNDER_BE_DIGEST" == "$PRELOCK_BE_DIGEST" ]] || die "TOCTOU backend digest changed pre=$PRELOCK_BE_DIGEST under=$UNDER_BE_DIGEST"
[[ "$UNDER_SF_DIGEST" == "$PRELOCK_SF_DIGEST" ]] || die "TOCTOU storefront digest changed pre=$PRELOCK_SF_DIGEST under=$UNDER_SF_DIGEST"
[[ "$UNDER_PIN_SHA" == "$PRELOCK_PIN_SHA" ]] || die "TOCTOU compose .env changed pre=$PRELOCK_PIN_SHA under=$UNDER_PIN_SHA"
log "under-lock freeze ok (ids, digests and pin file unchanged since pre-lock)"

# --- evidence ---------------------------------------------------------------
if [[ -n "${WOODRIGHT_EVIDENCE_DIR:-}" ]]; then
  EVIDENCE_DIR="${WOODRIGHT_EVIDENCE_DIR}"
else
  [[ -n "${WOODRIGHT_EVIDENCE_ROOT:-}" ]] || die "profile is missing WOODRIGHT_EVIDENCE_ROOT"
  EVIDENCE_DIR="${WOODRIGHT_EVIDENCE_ROOT%/}/private-pair-cutover-${TS_RUN}"
fi
assert_not_public_demo_name "evidence dir" "$EVIDENCE_DIR"
wr_cutover_evidence_init "$EVIDENCE_DIR" "production-candidate-execute" || die "evidence init failed: $EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR/pin-backup"
printf '%s\n' "$SOURCE_SHA" >"$EVIDENCE_DIR/json/application-source-sha.txt"
printf '%s\n' "${HELPER_INSTALL_SHA}" >"$EVIDENCE_DIR/json/helper-install-sha.txt"
prod_docker inspect "${WOODRIGHT_BE_CONTAINER_DEFAULT}" | wr_cutover_sanitize_inspect_json \
  >"$EVIDENCE_DIR/sanitized/backend-before.json" || true
prod_docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT}" | wr_cutover_sanitize_inspect_json \
  >"$EVIDENCE_DIR/sanitized/storefront-before.json" || true
wr_cutover_assert_no_secret_leak "$EVIDENCE_DIR/sanitized/backend-before.json" || die "secret-like material in backend evidence"
wr_cutover_assert_no_secret_leak "$EVIDENCE_DIR/sanitized/storefront-before.json" || die "secret-like material in storefront evidence"

# --- backup -----------------------------------------------------------------
backup_file() {
  local src="$1" name="$2"
  [[ -f "$src" ]] || return 0
  if [[ -r "$src" ]]; then
    cp -p "$src" "$EVIDENCE_DIR/pin-backup/$name" || return 1
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n cp -p "$src" "$EVIDENCE_DIR/pin-backup/$name" || return 1
  else
    return 1
  fi
  sha256_of "$EVIDENCE_DIR/pin-backup/$name" >"$EVIDENCE_DIR/pin-backup/${name}.sha256"
}
backup_file "$COMPOSE_ENV_FILE" dokploy-compose.env || die "compose .env backup failed"
[[ -f "$EVIDENCE_DIR/pin-backup/dokploy-compose.env" ]] || die "compose .env backup missing after backup step"
for own in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
  backup_file "${WOODRIGHT_OWNERSHIP_DIR%/}/$own" "$own" || die "ownership backup failed: $own"
done
record_state prepared

test_pause_at() {
  harness_enabled || return 0
  [[ "${WOODRIGHT_CUTOVER_TEST_PAUSE_AT:-}" == "$1" ]] || return 0
  local budget="${WOODRIGHT_CUTOVER_TEST_PAUSE_SEC:-10}"
  local waited=0
  log "HARNESS pause at $1 for up to ${budget}s (signal window)"
  while (( waited < budget * 5 )); do
    sleep 0.2
    waited=$((waited + 1))
  done
}

test_pause_at prepared

# --- pin writes -------------------------------------------------------------
render_pin() {
  local src="$1" out="$2" key="$3" value="$4"
  python3 - "$src" "$out" "$key" "$value" <<'PY'
import sys
src, out, key, value = sys.argv[1:5]
lines = open(src, "r", encoding="utf-8").read().splitlines()
found = False
result = []
for line in lines:
    if line.startswith(f"{key}="):
        if found:
            continue
        result.append(f"{key}={value}")
        found = True
    else:
        result.append(line)
if not found:
    result.append(f"{key}={value}")
open(out, "w", encoding="utf-8").write("\n".join(result) + "\n")
PY
}

validate_pin_file() {
  local path="$1" key="$2" value="$3" other_key="$4" other_expected="$5"
  python3 - "$path" "$key" "$value" "$other_key" "$other_expected" <<'PY'
import sys
path, key, value, other_key, other_expected = sys.argv[1:6]
lines = open(path, "r", encoding="utf-8").read().splitlines()
hits = [l for l in lines if l.startswith(f"{key}=")]
if len(hits) != 1 or hits[0] != f"{key}={value}":
    print(f"PIN_VALIDATION_FAILED {key} -> {hits}")
    sys.exit(1)
if other_key:
    other = [l for l in lines if l.startswith(f"{other_key}=")]
    if other_expected:
        if len(other) != 1 or other[0] != f"{other_key}={other_expected}":
            print(f"PIN_VALIDATION_FAILED sibling {other_key} -> {other}")
            sys.exit(1)
    elif len(other) > 1:
        print(f"PIN_VALIDATION_FAILED duplicate sibling {other_key}")
        sys.exit(1)
print("pin_file_ok")
PY
}

pin_value_of() {
  local key="$1"
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$COMPOSE_ENV_FILE" 2>/dev/null || true
}

# Atomic pin install for the required component set: render ALL required
# image keys into one temp file, validate the whole file, arm rollback
# (PHASE=pins_written) BEFORE the single install, then install once.
# This closes the mixed-pin window where a signal could land after the
# first key replace but before record_state.
write_required_pins_atomic() {
  local tmp cur be_want sf_want
  be_want="$(pin_value_of WOODRIGHT_BACKEND_IMAGE)"
  sf_want="$(pin_value_of WOODRIGHT_STOREFRONT_IMAGE)"
  need_be && be_want="$BE_REF"
  need_sf && sf_want="$SF_REF"

  tmp="$(mktemp "$(dirname "$COMPOSE_ENV_FILE")/.wr-prod-pin-XXXXXX" 2>/dev/null || true)"
  if [[ -z "$tmp" ]]; then
    log "NOTE pin tmp falls back to the evidence dir (compose dir not writable by this user)"
    tmp="$(mktemp "$EVIDENCE_DIR/pin-backup/.wr-prod-pin-XXXXXX")"
  fi
  cp -p "$COMPOSE_ENV_FILE" "$tmp" || { rm -f "$tmp"; return 1; }

  if need_be; then
    render_pin "$tmp" "${tmp}.be" WOODRIGHT_BACKEND_IMAGE "$BE_REF" || { rm -f "$tmp" "${tmp}.be"; return 1; }
    mv -f "${tmp}.be" "$tmp" || { rm -f "$tmp" "${tmp}.be"; return 1; }
  fi
  if need_sf; then
    render_pin "$tmp" "${tmp}.sf" WOODRIGHT_STOREFRONT_IMAGE "$SF_REF" || { rm -f "$tmp" "${tmp}.sf"; return 1; }
    mv -f "${tmp}.sf" "$tmp" || { rm -f "$tmp" "${tmp}.sf"; return 1; }
  fi

  if need_be; then
    validate_pin_file "$tmp" WOODRIGHT_BACKEND_IMAGE "$BE_REF" WOODRIGHT_STOREFRONT_IMAGE "$sf_want" >&2 \
      || { rm -f "$tmp"; return 1; }
  fi
  if need_sf; then
    validate_pin_file "$tmp" WOODRIGHT_STOREFRONT_IMAGE "$SF_REF" WOODRIGHT_BACKEND_IMAGE "$be_want" >&2 \
      || { rm -f "$tmp"; return 1; }
  fi

  # Fault injection: first_pin = fail before any install (no writes).
  # second_pin kept for harness compatibility = also fail before install
  # now that the pair is a single atomic install (no mixed state possible).
  if wr_fault first_pin || wr_fault second_pin; then
    rm -f "$tmp"
    return 1
  fi

  # Same-filesystem atomic publish via prod_atomic_install (sibling + mv).
  record_state pins_written
  if ! prod_atomic_install "$tmp" "$COMPOSE_ENV_FILE"; then
    rm -f "$tmp"
    return 1
  fi
  rm -f "$tmp"
  need_be && PINS_WRITTEN="${PINS_WRITTEN} WOODRIGHT_BACKEND_IMAGE" \
    && printf '%s WOODRIGHT_BACKEND_IMAGE=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$BE_REF" >>"$EVIDENCE_DIR/json/pins-written.txt"
  need_sf && PINS_WRITTEN="${PINS_WRITTEN} WOODRIGHT_STOREFRONT_IMAGE" \
    && printf '%s WOODRIGHT_STOREFRONT_IMAGE=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SF_REF" >>"$EVIDENCE_DIR/json/pins-written.txt"
  log "PIN_WRITTEN_ATOMIC keys=${PINS_WRITTEN}"
  return 0
}

if ! write_required_pins_atomic; then
  # If we armed pins_written then failed the install, EXIT trap rolls back.
  # If we failed before arming, die leaves PHASE=prepared (no rollback needed).
  die "atomic pin write failed - no container was recreated"
fi

test_pause_at pins_written

# --- recreate ---------------------------------------------------------------
compose_up() {
  local service="$1"
  prod_compose -f "${WOODRIGHT_COMPOSE_FILE}" --env-file "$COMPOSE_ENV_FILE" \
    --project-name "${WOODRIGHT_COMPOSE_PROJECT}" up -d --no-deps "$service"
}

recreate_component() {
  local kind="$1"
  local name keeper want_digest fault
  if [[ "$kind" == "backend" ]]; then
    name="${WOODRIGHT_BE_CONTAINER_DEFAULT}"; want_digest="${BE_REF##*@}"; fault="backend_recreate"
  else
    name="${WOODRIGHT_SF_CONTAINER_DEFAULT}"; want_digest="${SF_REF##*@}"; fault="storefront_recreate"
  fi
  keeper="${name}-keeper-${TS_RUN}"
  prod_docker rename "$name" "$keeper" >/dev/null 2>&1 || {
    log "$kind: rename to keeper failed"
    return 1
  }
  if [[ "$kind" == "backend" ]]; then KEEPER_BE="$keeper"; else KEEPER_SF="$keeper"; fi
  log "$kind: live container renamed to keeper $keeper"
  local up_rc=0
  compose_up "$kind" >&2 || up_rc=$?
  if wr_fault "$fault"; then up_rc=1; fi
  if [[ "$up_rc" -ne 0 ]]; then
    log "$kind: compose up failed rc=$up_rc"
    return 1
  fi
  prod_docker inspect "$name" >/dev/null 2>&1 || {
    log "$kind: recreated container '$name' is missing after compose up"
    return 1
  }
  local got
  got="$(container_digest "$name")"
  if wr_fault wrong_digest_after_recreate; then got="sha256:$(printf '0%.0s' {1..64})"; fi
  if [[ "$got" != "$want_digest" ]]; then
    log "$kind: digest mismatch after recreate have=$got want=$want_digest"
    return 1
  fi
  COMPONENTS_RECREATED="${COMPONENTS_RECREATED} ${kind}"
  log "$kind: recreated at $want_digest"
  return 0
}

if need_be; then
  if ! recreate_component backend; then
    die "backend recreate failed"
  fi
fi
if need_sf; then
  if ! recreate_component storefront; then
    die "storefront recreate failed"
  fi
fi
record_state containers_recreated

# --- health -----------------------------------------------------------------
docker_health_ok() {
  local name="$1" status health
  status="$(prod_docker inspect "$name" --format '{{.State.Status}}' 2>/dev/null || true)"
  health="$(prod_docker inspect "$name" --format '{{.State.Health.Status}}' 2>/dev/null || true)"
  if [[ "${WOODRIGHT_CUTOVER_TEST_FORCE_HEALTH:-}" == "healthy" ]] && harness_enabled; then
    log "HARNESS forced health=healthy for $name (status=$status)"
    return 0
  fi
  [[ "$status" == "running" ]] || { log "health: $name status=$status"; return 1; }
  case "$health" in
    healthy) return 0 ;;
    ""|"<no value>"|"<nil>")
      log "health: $name has no healthcheck - accepting running status"
      return 0
      ;;
    *) log "health: $name health=$health"; return 1 ;;
  esac
}

http_status() {
  local url="$1"
  if [[ -n "${WOODRIGHT_FAKE_HTTP_BIN:-}" ]] && harness_enabled; then
    "${WOODRIGHT_FAKE_HTTP_BIN}" "$url" 2>/dev/null || echo 000
    return 0
  fi
  curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo 000
}

http_gate() {
  local label="$1" url="$2"
  if [[ "${WOODRIGHT_CUTOVER_SKIP_HTTP:-0}" == "1" ]] && harness_enabled; then
    log "HARNESS skipping HTTP gate $label ($url)"
    return 0
  fi
  local code
  code="$(http_status "$url")"
  printf '%s %s %s\n' "$label" "$url" "$code" >>"$EVIDENCE_DIR/raw/http-gates.txt"
  [[ "$code" == "200" ]] || { log "http gate FAILED $label $url code=$code"; return 1; }
  log "http gate ok $label $url code=$code"
  return 0
}

if need_be; then
  if wr_fault backend_health || ! docker_health_ok "${WOODRIGHT_BE_CONTAINER_DEFAULT}"; then
    die "backend health gate failed"
  fi
  if wr_fault backend_http || ! http_gate backend "${WOODRIGHT_API_HOST%/}/health"; then
    die "backend HTTP gate failed"
  fi
fi
if need_sf; then
  if wr_fault storefront_health || ! docker_health_ok "${WOODRIGHT_SF_CONTAINER_DEFAULT}"; then
    die "storefront health gate failed"
  fi
  if wr_fault storefront_http || ! http_gate storefront "${WOODRIGHT_BUYER_HOST%/}/"; then
    die "storefront HTTP gate failed"
  fi
fi
record_state health_passed

# --- acceptance -------------------------------------------------------------
if wr_fault public_bind; then
  die "acceptance failed: public bind detected after recreate"
fi
if wr_fault public_traefik; then
  die "acceptance failed: public Traefik label detected after recreate"
fi
if need_be; then
  assert_private_binds "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "$BE_PORT" >&2 || die "acceptance failed: backend bind is not private"
  assert_no_public_traefik "${WOODRIGHT_BE_CONTAINER_DEFAULT}" >&2 || die "acceptance failed: backend Traefik exposure"
  wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend \
    || die "acceptance failed: backend no longer matches the production profile"
fi
if need_sf; then
  assert_private_binds "${WOODRIGHT_SF_CONTAINER_DEFAULT}" "$SF_PORT" >&2 || die "acceptance failed: storefront bind is not private"
  assert_no_public_traefik "${WOODRIGHT_SF_CONTAINER_DEFAULT}" >&2 || die "acceptance failed: storefront Traefik exposure"
  wr_assert_container_matches_environment "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront \
    || die "acceptance failed: storefront no longer matches the production profile"
fi
assert_media_volume >&2 || die "acceptance failed: media volume gate"
record_state acceptance_passed

# --- scoped ownership metadata (ACTIVE only after health + gates) -----------
write_ownership_metadata() {
  local dir="${WOODRIGHT_OWNERSHIP_DIR%/}"
  [[ -n "$dir" ]] || { log "ownership dir unset"; return 1; }
  local f
  for f in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
    wr_assert_manifest_path_for_environment "$dir/$f" || return 1
  done
  mkdir -p "$dir" 2>/dev/null || sudo -n mkdir -p "$dir" 2>/dev/null || true
  [[ -d "$dir" ]] || { log "ownership dir missing: $dir"; return 1; }

  # Record which ownership files are NEW so rollback can delete them
  # (restore from backup alone cannot undo a create-without-prior-file).
  : >"$EVIDENCE_DIR/json/ownership-created.txt"
  for f in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
    if [[ ! -f "$dir/$f" ]]; then
      printf '%s\n' "$f" >>"$EVIDENCE_DIR/json/ownership-created.txt"
    fi
  done

  if wr_fault metadata_write; then
    return 1
  fi

  WR_META_DIR="$dir" \
  WR_META_ENV="$WOODRIGHT_ENVIRONMENT" \
  WR_META_CLASS="$WOODRIGHT_ENVIRONMENT_CLASS" \
  WR_META_COMPONENT="$COMPONENT" \
  WR_META_APP_SHA="$SOURCE_SHA" \
  WR_META_HELPER_SHA="$HELPER_INSTALL_SHA" \
  WR_META_BE_REF="$BE_REF" \
  WR_META_SF_REF="$SF_REF" \
  WR_META_BE_CONTAINER="${WOODRIGHT_BE_CONTAINER_DEFAULT}" \
  WR_META_SF_CONTAINER="${WOODRIGHT_SF_CONTAINER_DEFAULT}" \
  WR_META_PROJECT="${WOODRIGHT_COMPOSE_PROJECT}" \
  WR_META_OWNER="${WOODRIGHT_REQUIRED_OWNER_LABEL:-Dokploy}" \
  WR_META_EVIDENCE="$EVIDENCE_DIR" \
  WR_META_STAGING="$EVIDENCE_DIR/json/ownership-staging" \
  python3 <<'PY' || return 1
import json, os, tempfile, datetime, shutil

d = os.environ["WR_META_DIR"]
staging = os.environ["WR_META_STAGING"]
os.makedirs(staging, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
app_sha = os.environ["WR_META_APP_SHA"]
helper_sha = os.environ.get("WR_META_HELPER_SHA", "")
component = os.environ["WR_META_COMPONENT"]
be_ref = os.environ.get("WR_META_BE_REF", "")
sf_ref = os.environ.get("WR_META_SF_REF", "")

common = {
    "environment": os.environ["WR_META_ENV"],
    "environment_class": os.environ["WR_META_CLASS"],
    "component": component,
    # Two distinct provenance fields - the helper SHA is never the release SHA.
    "application_source_sha": app_sha,
    "helper_install_sha": helper_sha,
    "public_exposure": "private",
    "updated_at_utc": now,
}

docs = {
    "ACTIVE_OWNER.json": dict(
        common,
        schema="woodright.production_candidate.active_owner.v1",
        owner=os.environ["WR_META_OWNER"],
        compose_project=os.environ["WR_META_PROJECT"],
        backend_container=os.environ["WR_META_BE_CONTAINER"],
        storefront_container=os.environ["WR_META_SF_CONTAINER"],
    ),
    "EXPECTED_RELEASE.json": dict(
        common,
        schema="woodright.production_candidate.expected_release.v1",
        backend_image=be_ref,
        backend_digest=be_ref.split("@")[-1] if be_ref else "",
        storefront_image=sf_ref,
        storefront_digest=sf_ref.split("@")[-1] if sf_ref else "",
    ),
    "ACTIVE_RELEASE.json": dict(
        common,
        schema="woodright.production_candidate.active_release.v1",
        state="committed",
        backend_image=be_ref,
        storefront_image=sf_ref,
        evidence_dir=os.environ["WR_META_EVIDENCE"],
        activated_at_utc=now,
    ),
}

# Stage ALL docs first (no live destination mutated yet).
staged = {}
for name, doc in docs.items():
    path = os.path.join(staging, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2, sort_keys=True)
        fh.write("\n")
    os.chmod(path, 0o600)
    staged[name] = path
PY

  # Arm metadata rollback BEFORE the first live install so a signal mid-way
  # restores backups / removes newly created files.
  METADATA_WRITTEN=1

  if wr_fault metadata_install; then
    log "HARNESS fault metadata_install after staging, before live install"
    return 1
  fi

  local name staged_src dest
  for name in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
    staged_src="$EVIDENCE_DIR/json/ownership-staging/$name"
    dest="$dir/$name"
    [[ -f "$staged_src" ]] || { log "staged ownership missing: $name"; return 1; }
    if ! prod_atomic_install "$staged_src" "$dest"; then
      log "ownership install failed for $name"
      return 1
    fi
    chmod 0600 "$dest" 2>/dev/null || sudo -n chmod 0600 "$dest" 2>/dev/null || true
  done

  log "ownership metadata written under $dir (application_source_sha=$SOURCE_SHA helper_install_sha=${HELPER_INSTALL_SHA:-<empty>})"
  return 0
}

if ! write_ownership_metadata; then
  die "scoped ownership metadata write failed"
fi

# --- commit -----------------------------------------------------------------
COMMITTED=1
record_state committed
{
  echo "# Private production-candidate cutover"
  echo "- component: $COMPONENT"
  echo "- application_source_sha: $SOURCE_SHA"
  echo "- helper_install_sha: ${HELPER_INSTALL_SHA:-<empty>}"
  echo "- backend: ${BE_REF:-n/a}"
  echo "- storefront: ${SF_REF:-n/a}"
  echo "- keepers: ${KEEPER_BE:-none} / ${KEEPER_SF:-none}"
  echo "- lock: $WR_STAGING_MUTATION_LOCK_PATH"
} >"$EVIDENCE_DIR/SUMMARY.md"

# Re-inspect so the final packet reports the post-cutover runtime, not the
# pre-lock snapshot captured during validation.
inspect_container BE "${WOODRIGHT_BE_CONTAINER_DEFAULT}"
inspect_container SF "${WOODRIGHT_SF_CONTAINER_DEFAULT}"
emit_packet execute committed >"$EVIDENCE_DIR/json/final-packet.json"
cat "$EVIDENCE_DIR/json/final-packet.json"
log "PRODUCTION_CANDIDATE_CUTOVER_OK component=$COMPONENT application_source_sha=$SOURCE_SHA helper_install_sha=${HELPER_INSTALL_SHA:-<empty>}"
exit 0
