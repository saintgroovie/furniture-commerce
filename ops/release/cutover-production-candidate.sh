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
# TWO DISTINCT SHA LAYERS - never conflate them:
#   application_source_sha  = --source-sha of the MUTATED component (pair: both
#                             images). Informational / lock metadata. Monitor
#                             must not use it as the revision of the untouched peer.
#   storefront_source_sha / backend_source_sha = per-component OCI revisions.
#   helper_install_sha      = the ops commit that installed THIS script
#                             (WOODRIGHT_HELPER_INSTALL_SHA, else
#                             /srv/woodright/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt,
#                             else empty). It is recorded next to - never as -
#                             the release SHA in ACTIVE_*/EXPECTED_RELEASE.
#
# EXPECTED_RELEASE after any successful cutover is a complete pair:
#   storefront_digest + storefront_source_sha AND backend_digest + backend_source_sha.
# Single-component cutover replaces one identity and preserves the verified peer.
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
#            -> acceptance_passed
#            -> committed | rolled_back | rollback_incomplete
#            | failed_before_mutation
#
# Rollback is armed by the FIRST successful pin write; any P0/P1 after that
# restores the backed-up pins and brings the runtime back to them under the
# same lock. NO KEEPER CONTAINERS: renaming a live container aside keeps its
# Compose project labels, so the next `compose up` recreates/destroys the
# keeper and the "restore" silently becomes a no-op. The rollback authority is
# the pair (backed-up compose .env, PRE_BE_REF/PRE_SF_REF - the exact
# immutable RepoDigest refs of the containers that were live before the first
# write, proven present locally before any mutation).
#
# Rollback is only reported as rolled_back (exit 10) after ALL postconditions
# hold: pins restored, runtime RepoDigests byte-equal to the restored pin refs,
# private loopback binds, media volume mounted, no public Traefik, and the
# minimal loopback HTTP gates. If any postcondition fails the run reports
# rollback_incomplete (exit 13) - never a false ROLLBACK_OK.
#
# Never migrations, seeds, DNS, public Traefik labels, prune, or postgres/redis
# recreate.
#
# Pre-existing pin/runtime skew (compose .env pins != live container digests)
# is refused before the lock and before any write: a normal cutover cannot use
# a pin file that does not describe the runtime, because that file is also the
# rollback anchor. Recover first with
# ops/release/recover-production-candidate-skew.sh.
#
# Exit codes:
#   0 ok | 2 usage/validation | 3 lock | 4 dry-run candidate mismatch
#   10 rollback_ok (verified) | 11 rollback_partial (reserved, not emitted)
#   12 rollback_failed (pins could not be restored)
#   13 rollback_incomplete (pins restored, postconditions not proven)
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
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/woodright-install-provenance.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"
# shellcheck source=../lib/woodright-compose-service-recreate.sh
source "$HERE/../lib/woodright-compose-service-recreate.sh"
# shellcheck source=../lib/woodright-component-authority.sh
source "$HERE/../lib/woodright-component-authority.sh"
# shellcheck source=../lib/woodright-oci-provenance.sh
source "$HERE/../lib/woodright-oci-provenance.sh"
# shellcheck source=../lib/woodright-compose-env-authority.sh
source "$HERE/../lib/woodright-compose-env-authority.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-production-ownership-access.sh
source "$HERE/../lib/woodright-production-ownership-access.sh"

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
TS_RUN="$(date -u +%Y%m%dT%H%M%SZ)"

# Rollback anchors: the exact immutable refs the containers ran on before the
# first write. Captured under the lock, proven present locally, and recorded in
# the evidence dir before any pin is installed.
PRE_BE_REF=""
PRE_SF_REF=""
PRE_RELEASE_SHA=""

# Pre-existing pin/runtime skew (computed read-only in both modes).
LIVE_BE_REF=""
LIVE_SF_REF=""
PIN_BE_VALUE=""
PIN_SF_VALUE=""
SKEW_BE="unknown"
SKEW_SF="unknown"
EXISTING_SKEW=0

# Readiness polling defaults (seconds). Both are derived from the image
# healthcheck when it is inspectable; these are the documented fallbacks for
# images whose HEALTHCHECK cannot be read (backend --start-period=60s,
# storefront --start-period=40s, plus interval*retries and margin).
READY_DEADLINE_BE_DEFAULT=180
READY_DEADLINE_SF_DEFAULT=150
READY_DEADLINE_MARGIN_SEC=30
READY_POLL_INTERVAL_DEFAULT=2
# A container that keeps restarting is terminal, not "still starting".
READY_RESTART_LOOP_THRESHOLD=3

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
Execute: pins (component source SHAs always; WOODRIGHT_RELEASE_SHA only when both
         OCI revisions equal SOURCE_SHA) -> recreate BOTH services (image cutover
         for the mutated component; env refresh of the untouched peer on its CAS
         live digest) -> readiness of both -> ACTIVE, under
         /srv/woodright/locks/production/live-cutover.lock, with automatic
         rollback (restore pins, recreate on the pre-cutover digests, verify
         postconditions) on any failure after the first pin write. No keeper
         containers are created or trusted.

Exit codes: 0 ok | 2 validation | 3 lock | 4 dry-run mismatch
            10 rollback_ok (verified) | 12 rollback_failed | 13 rollback_incomplete
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
  # Canonical authority: tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt
  # (via wr_resolve_installed_governance_sha). Legacy cutover/root markers are
  # mirrors only - mismatch fail-closes mutating paths.
  local mode_flag="--mutating"
  if [[ "${MODE:-}" == "dry-run" || "${DRY_RUN:-0}" == "1" ]]; then
    mode_flag="--dry-run"
  fi
  # Harness may set WOODRIGHT_INSTALL_WR_ROOT / WOODRIGHT_HELPER_INSTALL_SHA.
  if ! wr_resolve_installed_governance_sha "$mode_flag"; then
    die "installed governance/helper provenance unresolved or drifted (canonical vs legacy markers)"
  fi
  HELPER_INSTALL_SHA="$WR_INSTALLED_GOVERNANCE_SHA"
  log "operation_helper_install_sha=$HELPER_INSTALL_SHA source=$WR_INSTALL_PROVENANCE_SOURCE legacy_cutover=$WR_INSTALL_PROVENANCE_LEGACY_CUTOVER legacy_root=$WR_INSTALL_PROVENANCE_LEGACY_ROOT"
}


# ---------------------------------------------------------------------------
# CLI + environment authority
# ---------------------------------------------------------------------------
FULL_ARGV=("$@")

# --help must work before the environment gate: refusing to print usage until
# the operator already knows the flags is not a safety property.
for wr_arg in "${FULL_ARGV[@]-}"; do
  case "$wr_arg" in
    -h|--help) usage; exit 0 ;;
  esac
done

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
is_sha40() { [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]; }

# Mutated component: SOURCE_SHA. Untouched peer: live OCI revision (CAS), never
# a caller-supplied peer ref. EXPECT_* wins after resolve_pair_expected_identities.
packet_backend_source_sha() {
  if is_sha40 "${EXPECT_BE_SHA:-}"; then printf '%s' "$EXPECT_BE_SHA"; return 0; fi
  if need_be; then printf '%s' "$SOURCE_SHA"; return 0; fi
  wr_oci_image_revision "${LIVE_BE_REF:-}"
}
packet_storefront_source_sha() {
  if is_sha40 "${EXPECT_SF_SHA:-}"; then printf '%s' "$EXPECT_SF_SHA"; return 0; fi
  if need_sf; then printf '%s' "$SOURCE_SHA"; return 0; fi
  wr_oci_image_revision "${LIVE_SF_REF:-}"
}
# Defined early: dry-run packet builders call this before the execute-only
# section where a duplicate used to live (late definition → command-not-found).
component_in_scope() {
  case "$1" in
    backend) need_be ;;
    *) need_sf ;;
  esac
}

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

container_started_at() { prod_docker inspect "$1" --format '{{.State.StartedAt}}' 2>/dev/null || true; }

# Exact immutable RepoDigest ref (registry/repository@sha256:<64hex>) of a live
# container. Config.Image is authoritative when compose pinned a digest ref;
# otherwise fall back to the shared image-inspect resolver. Empty output means
# "cannot prove it" - callers that need a rollback anchor must fail closed.
resolve_live_ref() {
  local name="$1" title="$2" component="$3"
  local want_repo="${IMAGE_REGISTRY%/}/${title}"
  local ref=""
  ref="$(prod_docker inspect "$name" --format '{{.Config.Image}}' 2>/dev/null || true)"
  if [[ "$ref" != "${want_repo}@sha256:"* ]]; then
    ref=""
    if wr_cutover_resolve_container_image_identity "$name" "$component" "$want_repo" >/dev/null 2>&1; then
      ref="${WR_CUTOVER_REPO_DIGEST_REF:-}"
    fi
  fi
  case "$ref" in
    "${want_repo}@sha256:"*)
      [[ "${ref##*@}" =~ ^sha256:[0-9a-f]{64}$ ]] || ref=""
      ;;
    *) ref="" ;;
  esac
  printf '%s\n' "$ref"
}

live_oci_revision() {
  prod_docker inspect "$1" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
}

prev_expected_field() {
  local file="$1" key="$2"
  [[ -f "$file" && -r "$file" ]] || return 0
  python3 -c 'import json,sys
try:
  d=json.load(open(sys.argv[1]))
except Exception:
  raise SystemExit(0)
print(d.get(sys.argv[2]) or "")' "$file" "$key" 2>/dev/null || true
}

prev_expected_has_key() {
  local file="$1" key="$2"
  [[ -f "$file" && -r "$file" ]] || return 1
  python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
raise SystemExit(0 if sys.argv[2] in d else 1)' "$file" "$key" 2>/dev/null
}

# Untouched peer identity = live digest + OCI revision, CAS-checked against
# compose pin and previous EXPECTED when those fields are present. Disagreement
# is LIVE_COMPONENT_IDENTITY_DRIFT (no silent stale-metadata adoption).
cas_untouched_peer() {
  local kind="$1"
  local name title pin_key caller_ref live_ref live_dig live_rev pin pin_dig
  local exp exp_dig exp_sha app

  if [[ "$kind" == "backend" ]]; then
    name="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
    title="${WOODRIGHT_REQUIRED_BE_TITLE:-woodright-backend}"
    pin_key=WOODRIGHT_BACKEND_IMAGE
    caller_ref="$BE_REF"
  else
    name="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
    title="${WOODRIGHT_REQUIRED_SF_TITLE:-woodright-storefront}"
    pin_key=WOODRIGHT_STOREFRONT_IMAGE
    caller_ref="$SF_REF"
  fi

  live_ref="$(resolve_live_ref "$name" "$title" "$kind")"
  [[ "$live_ref" == *@sha256:* ]] || die "LIVE_COMPONENT_IDENTITY_DRIFT cannot prove live $kind digest"
  live_dig="${live_ref##*@}"
  [[ "$live_dig" =~ ^sha256:[0-9a-f]{64}$ ]] || die "LIVE_COMPONENT_IDENTITY_DRIFT live $kind digest malformed"
  live_rev="$(live_oci_revision "$name")"
  [[ "$live_rev" =~ ^[0-9a-f]{40}$ ]] || die "LIVE_COMPONENT_IDENTITY_DRIFT live $kind OCI revision missing/malformed"

  pin="$(pin_value_of "$pin_key")"
  if [[ -n "$pin" ]]; then
    pin_dig="${pin##*@}"
    [[ "$pin_dig" == "$live_dig" ]] || die "LIVE_COMPONENT_IDENTITY_DRIFT $kind compose pin != live digest"
  fi

  exp="${WOODRIGHT_OWNERSHIP_DIR%/}/EXPECTED_RELEASE.json"
  if [[ -f "$exp" && -r "$exp" ]]; then
    exp_dig="$(prev_expected_field "$exp" "${kind}_digest")"
    if [[ -n "$exp_dig" ]]; then
      [[ "$exp_dig" =~ ^sha256:[0-9a-f]{64}$ ]] || die "malformed previous ${kind}_digest"
      [[ "$exp_dig" == "$live_dig" ]] || die "LIVE_COMPONENT_IDENTITY_DRIFT previous EXPECTED ${kind}_digest != live"
    fi
    if prev_expected_has_key "$exp" "${kind}_source_sha"; then
      exp_sha="$(prev_expected_field "$exp" "${kind}_source_sha")"
      [[ "$exp_sha" =~ ^[0-9a-f]{40}$ ]] || die "malformed previous ${kind}_source_sha"
      [[ "$exp_sha" == "$live_rev" ]] || die "LIVE_COMPONENT_IDENTITY_DRIFT previous EXPECTED ${kind}_source_sha != live OCI revision"
    elif [[ -n "$exp_dig" ]]; then
      app="$(prev_expected_field "$exp" application_source_sha)"
      if [[ -n "$app" ]]; then
        [[ "$app" =~ ^[0-9a-f]{40}$ ]] || die "malformed previous application_source_sha"
        [[ "$app" == "$live_rev" ]] || die "LIVE_COMPONENT_IDENTITY_DRIFT previous application_source_sha != live $kind revision"
      fi
    fi
  fi

  if [[ -n "$caller_ref" ]]; then
    [[ "$caller_ref" == "$live_ref" ]] \
      || die "peer $kind ref refused (caller does not match live): caller='$caller_ref' live='$live_ref'"
  fi

  if [[ "$kind" == "backend" ]]; then
    EXPECT_BE_REF="$live_ref"
    EXPECT_BE_SHA="$live_rev"
  else
    EXPECT_SF_REF="$live_ref"
    EXPECT_SF_SHA="$live_rev"
  fi
}

resolve_pair_expected_identities() {
  EXPECT_BE_REF=""
  EXPECT_BE_SHA=""
  EXPECT_SF_REF=""
  EXPECT_SF_SHA=""
  if need_be; then
    EXPECT_BE_REF="$BE_REF"
    EXPECT_BE_SHA="$SOURCE_SHA"
  else
    cas_untouched_peer backend
  fi
  if need_sf; then
    EXPECT_SF_REF="$SF_REF"
    EXPECT_SF_SHA="$SOURCE_SHA"
  else
    cas_untouched_peer storefront
  fi
  [[ "${EXPECT_BE_REF##*@}" =~ ^sha256:[0-9a-f]{64}$ ]] || die "missing required backend identity digest after resolve"
  [[ "$EXPECT_BE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "missing required backend identity SHA after resolve"
  [[ "${EXPECT_SF_REF##*@}" =~ ^sha256:[0-9a-f]{64}$ ]] || die "missing required storefront identity digest after resolve"
  [[ "$EXPECT_SF_SHA" =~ ^[0-9a-f]{40}$ ]] || die "missing required storefront identity SHA after resolve"
  if [[ -n "$EVIDENCE_DIR" ]]; then
    python3 - "$EVIDENCE_DIR/json/resolved-pair-identities.json" \
      "$COMPONENT" "$SOURCE_SHA" "$EXPECT_BE_REF" "$EXPECT_BE_SHA" "$EXPECT_SF_REF" "$EXPECT_SF_SHA" <<'PY'
import json, sys
path, component, app, be_ref, be_sha, sf_ref, sf_sha = sys.argv[1:8]
json.dump({
    "component": component,
    "application_source_sha": app,
    "backend_image": be_ref,
    "backend_digest": be_ref.split("@")[-1],
    "backend_source_sha": be_sha,
    "storefront_image": sf_ref,
    "storefront_digest": sf_ref.split("@")[-1],
    "storefront_source_sha": sf_sha,
}, open(path, "w"), indent=2, sort_keys=True)
PY
  fi
  log "pair identity backend=${EXPECT_BE_REF##*@}/$EXPECT_BE_SHA storefront=${EXPECT_SF_REF##*@}/$EXPECT_SF_SHA"
}

recheck_untouched_peer_before_metadata() {
  local name title live_ref live_rev
  if wr_fault peer_change; then
    python3 - "${WOODRIGHT_FAKE_DOCKER_STATE:-}" <<'PY'
import json, os, sys
state = sys.argv[1]
if not state:
    raise SystemExit(1)
path = os.path.join(state, "containers", "woodright-production-backend.json")
props = os.path.join(state, "containers", "woodright-production-backend.props")
doc = json.load(open(path))
spoof = "sha256:" + ("e" * 64)
img = "ghcr.io/saintgroovie/woodright-backend@" + spoof
if isinstance(doc, list):
    doc[0]["Config"]["Image"] = img
    doc[0]["RepoDigests"] = [img]
json.dump(doc, open(path, "w"))
if os.path.exists(props):
    os.remove(props)
PY
  fi
  if ! need_be; then
    name="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
    title="${WOODRIGHT_REQUIRED_BE_TITLE:-woodright-backend}"
    live_ref="$(resolve_live_ref "$name" "$title" backend)"
    live_rev="$(live_oci_revision "$name")"
    [[ "$live_ref" == "$EXPECT_BE_REF" && "$live_rev" == "$EXPECT_BE_SHA" ]] \
      || die "LIVE_COMPONENT_IDENTITY_DRIFT backend changed before metadata commit live_ref='$live_ref' live_rev='$live_rev'"
  fi
  if ! need_sf; then
    name="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
    title="${WOODRIGHT_REQUIRED_SF_TITLE:-woodright-storefront}"
    live_ref="$(resolve_live_ref "$name" "$title" storefront)"
    live_rev="$(live_oci_revision "$name")"
    [[ "$live_ref" == "$EXPECT_SF_REF" && "$live_rev" == "$EXPECT_SF_SHA" ]] \
      || die "LIVE_COMPONENT_IDENTITY_DRIFT storefront changed before metadata commit live_ref='$live_ref' live_rev='$live_rev'"
  fi
}

pin_value_of() {
  local key="$1"
  [[ -r "$COMPOSE_ENV_FILE" ]] || return 0
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$COMPOSE_ENV_FILE" 2>/dev/null || true
}

# Read-only comparison of the compose .env pins against the live runtime.
# "unknown" whenever either side cannot be proven (absent container, unreadable
# pin file) - only a proven difference sets the skew flag.
detect_existing_skew() {
  local verdict
  PIN_BE_VALUE="$(pin_value_of WOODRIGHT_BACKEND_IMAGE)"
  PIN_SF_VALUE="$(pin_value_of WOODRIGHT_STOREFRONT_IMAGE)"
  if [[ "${WR_BE_CONTAINER_PRESENT:-false}" == "true" ]]; then
    LIVE_BE_REF="$(resolve_live_ref "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "${WOODRIGHT_REQUIRED_BE_TITLE:-woodright-backend}" backend)"
  fi
  if [[ "${WR_SF_CONTAINER_PRESENT:-false}" == "true" ]]; then
    LIVE_SF_REF="$(resolve_live_ref "${WOODRIGHT_SF_CONTAINER_DEFAULT}" "${WOODRIGHT_REQUIRED_SF_TITLE:-woodright-storefront}" storefront)"
  fi
  for verdict in backend storefront; do
    local pin live result
    if [[ "$verdict" == "backend" ]]; then pin="$PIN_BE_VALUE"; live="$LIVE_BE_REF"; else pin="$PIN_SF_VALUE"; live="$LIVE_SF_REF"; fi
    if [[ -z "$pin" || -z "$live" ]]; then
      result="unknown"
    elif [[ "$pin" == "$live" ]]; then
      result="match"
    else
      result="skew"
      EXISTING_SKEW=1
      log "EXISTING_PIN_RUNTIME_SKEW $verdict pin=$pin runtime=$live"
    fi
    if [[ "$verdict" == "backend" ]]; then SKEW_BE="$result"; else SKEW_SF="$result"; fi
  done
}

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
# Loopback HTTP probes. Defined before the readiness/rollback helpers so the
# EXIT-trap rollback path can always reach them, whatever phase it fires in.
# ---------------------------------------------------------------------------
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
  if [[ -n "$EVIDENCE_DIR" && -d "$EVIDENCE_DIR/raw" ]]; then
    printf '%s %s %s\n' "$label" "$url" "$code" >>"$EVIDENCE_DIR/raw/http-gates.txt" 2>/dev/null || true
  fi
  [[ "$code" == "200" ]] || { log "http gate FAILED $label $url code=$code"; return 1; }
  log "http gate ok $label $url code=$code"
  return 0
}

# ---------------------------------------------------------------------------
# Readiness polling (replaces the one-shot docker_health_ok that treated the
# Docker health state "starting" as a hard failure - backend HEALTHCHECK uses
# --start-period=60s and storefront --start-period=40s, so a fresh container is
# ALWAYS "starting" for a while and a one-shot read is guaranteed to be wrong).
# ---------------------------------------------------------------------------
ready_poll_interval() {
  if harness_enabled && [[ -n "${WOODRIGHT_CUTOVER_POLL_INTERVAL_SEC:-}" ]]; then
    printf '%s\n' "${WOODRIGHT_CUTOVER_POLL_INTERVAL_SEC}"
    return 0
  fi
  printf '%s\n' "$READY_POLL_INTERVAL_DEFAULT"
}

# Deadline for one component. Derived from the image/container HEALTHCHECK when
# Docker exposes it (StartPeriod + Interval*Retries + margin, all in ns), else
# the documented fallbacks: backend 180s, storefront 150s.
component_ready_deadline_sec() {
  local kind="$1" name="$2"
  local fallback="$READY_DEADLINE_BE_DEFAULT"
  [[ "$kind" == "backend" ]] || fallback="$READY_DEADLINE_SF_DEFAULT"
  if harness_enabled && [[ -n "${WOODRIGHT_CUTOVER_READY_DEADLINE_SEC:-}" ]]; then
    printf '%s\n' "${WOODRIGHT_CUTOVER_READY_DEADLINE_SEC}"
    return 0
  fi
  local blob start interval retries derived
  blob="$(prod_docker inspect "$name" --format \
    "{{.Config.Healthcheck.StartPeriod}}${WR_FIELD_SEP}{{.Config.Healthcheck.Interval}}${WR_FIELD_SEP}{{.Config.Healthcheck.Retries}}" \
    2>/dev/null || true)"
  local fields=() line
  while IFS= read -r line; do fields+=("$line"); done <<<"${blob//${WR_FIELD_SEP}/$'\n'}"
  start="${fields[0]-}"; interval="${fields[1]-}"; retries="${fields[2]-}"
  if [[ "$start" =~ ^[0-9]+$ && "$interval" =~ ^[0-9]+$ && "$retries" =~ ^[0-9]+$ && "$start" -gt 0 ]]; then
    derived=$(( start / 1000000000 + (interval / 1000000000) * retries + READY_DEADLINE_MARGIN_SEC ))
    if [[ "$derived" -gt 0 ]]; then
      printf '%s\n' "$derived"
      return 0
    fi
  fi
  printf '%s\n' "$fallback"
}

readiness_url_for() {
  case "$1" in
    backend) printf '%s\n' "${WOODRIGHT_API_HOST%/}/health" ;;
    *) printf '%s\n' "${WOODRIGHT_BUYER_HOST%/}/" ;;
  esac
}

poll_note() {
  local kind="$1"
  shift
  [[ -n "$EVIDENCE_DIR" && -d "$EVIDENCE_DIR/raw" ]] || return 0
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$EVIDENCE_DIR/raw/health-poll-$kind.txt" 2>/dev/null || true
  return 0
}

# wait_component_ready <kind> <container-name> <deadline-sec> [phase-label]
#   absent / exited / dead / removing / restart loop -> immediate failure
#   starting                                          -> transient, keep polling
#   healthy                                           -> proceed to HTTP
#   unhealthy                                         -> keep polling until deadline
#   no healthcheck                                    -> HTTP-only readiness
wait_component_ready() {
  local kind="$1" name="$2" deadline="$3" label="${4:-forward}"
  local url started now attempt=0 blob status health restarts fields=() line
  local docker_ready=0 healthcheck_present=1
  url="$(readiness_url_for "$kind")"
  started="$(date +%s)"
  poll_note "$kind" "begin label=$label container=$name deadline=${deadline}s url=$url"
  while :; do
    attempt=$((attempt + 1))
    if ! prod_docker inspect "$name" >/dev/null 2>&1; then
      poll_note "$kind" "attempt=$attempt container=absent"
      log "readiness: $kind container '$name' is absent - terminal"
      return 1
    fi
    blob="$(prod_docker inspect "$name" --format \
      "{{.State.Status}}${WR_FIELD_SEP}{{.State.Health.Status}}${WR_FIELD_SEP}{{.RestartCount}}" \
      2>/dev/null || true)"
    fields=()
    while IFS= read -r line; do fields+=("$line"); done <<<"${blob//${WR_FIELD_SEP}/$'\n'}"
    status="${fields[0]-}"; health="${fields[1]-}"; restarts="${fields[2]-}"
    if harness_enabled && [[ "${WOODRIGHT_CUTOVER_TEST_FORCE_HEALTH:-}" == "healthy" ]]; then
      health="healthy"
    fi
    poll_note "$kind" "attempt=$attempt status=${status:-<empty>} health=${health:-<none>} restarts=${restarts:-<none>}"
    case "$status" in
      exited|dead|removing)
        log "readiness: $kind status=$status - terminal"
        return 1
        ;;
    esac
    if [[ "$restarts" =~ ^[0-9]+$ ]] && [[ "$restarts" -ge "$READY_RESTART_LOOP_THRESHOLD" ]]; then
      log "readiness: $kind restart loop detected (RestartCount=$restarts >= $READY_RESTART_LOOP_THRESHOLD) - terminal"
      return 1
    fi
    case "$health" in
      healthy) docker_ready=1 ;;
      ""|"<no value>"|"<nil>")
        healthcheck_present=0
        docker_ready=1
        ;;
      *) docker_ready=0 ;;
    esac
    if [[ "$status" == "running" && "$docker_ready" == "1" ]]; then
      if [[ "$healthcheck_present" == "0" ]]; then
        log "readiness: $kind has no healthcheck - HTTP-only readiness"
      else
        log "readiness: $kind docker health=healthy after ${attempt} poll(s)"
      fi
      break
    fi
    now="$(date +%s)"
    if [[ $(( now - started )) -ge "$deadline" ]]; then
      log "readiness: $kind docker gate timed out after ${deadline}s (status=${status:-<empty>} health=${health:-<none>})"
      return 1
    fi
    sleep "$(ready_poll_interval)"
  done

  if harness_enabled && [[ "${WOODRIGHT_CUTOVER_SKIP_HTTP:-0}" == "1" ]]; then
    poll_note "$kind" "http skipped (harness)"
    return 0
  fi
  local code
  while :; do
    attempt=$((attempt + 1))
    code="$(http_status "$url")"
    poll_note "$kind" "attempt=$attempt http=$url code=$code"
    if [[ "$code" == "200" ]]; then
      log "readiness: $kind HTTP $url code=200"
      return 0
    fi
    now="$(date +%s)"
    if [[ $(( now - started )) -ge "$deadline" ]]; then
      log "readiness: $kind HTTP gate timed out after ${deadline}s (last code=$code url=$url)"
      return 1
    fi
    sleep "$(ready_poll_interval)"
  done
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

detect_existing_skew

# Would a rollback have images to recreate on? Reported in the dry-run packet so
# the operator learns about a missing anchor image before execute refuses.
rollback_anchor_images_present() {
  local kind ref
  for kind in backend storefront; do
    if [[ "$kind" == "backend" ]]; then ref="$LIVE_BE_REF"; else ref="$LIVE_SF_REF"; fi
    [[ -n "$ref" ]] || return 1
    prod_docker image inspect "$ref" >/dev/null 2>&1 || return 1
  done
  return 0
}

# Live compose after PR #207 interpolates ${WOODRIGHT_*_SOURCE_SHA:?required}.
# Dry-run reports whether the loaded compose file actually has that contract so
# rollback bootability can be judged without mutating.
compose_requires_component_source_sha_interpolation() {
  local f="${WOODRIGHT_COMPOSE_FILE:-}"
  [[ -f "$f" ]] || return 1
  grep -qE 'WOODRIGHT_BACKEND_SOURCE_SHA:[[:space:]]*\$\{WOODRIGHT_BACKEND_SOURCE_SHA:\?required\}' "$f" \
    && grep -qE 'WOODRIGHT_STOREFRONT_SOURCE_SHA:[[:space:]]*\$\{WOODRIGHT_STOREFRONT_SOURCE_SHA:\?required\}' "$f"
}

# Common WOODRIGHT_RELEASE_SHA is part of the atomic pin transaction when the
# resulting backend+storefront pin set both prove OCI revision == SOURCE_SHA.
should_write_common_release_sha() {
  local be_want sf_want be_rev sf_rev
  be_want="$(pin_value_of WOODRIGHT_BACKEND_IMAGE)"
  sf_want="$(pin_value_of WOODRIGHT_STOREFRONT_IMAGE)"
  need_be && be_want="$BE_REF"
  need_sf && sf_want="$SF_REF"
  [[ -n "$be_want" && -n "$sf_want" ]] || return 1
  be_rev="$(wr_oci_image_revision "$be_want")"
  sf_rev="$(wr_oci_image_revision "$sf_want")"
  [[ "$be_rev" == "$SOURCE_SHA" && "$sf_rev" == "$SOURCE_SHA" ]]
}

emit_packet() {
  local packet_mode="$1" verdict="$2"
  local write_release=0
  if should_write_common_release_sha; then write_release=1; fi
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
  WR_PACKET_WRITE_RELEASE_SHA="$write_release" \
  WR_PACKET_CURRENT_RELEASE_SHA="$(pin_value_of WOODRIGHT_RELEASE_SHA)" \
  WR_PACKET_COMPOSE_ENV="$COMPOSE_ENV_FILE" \
  WR_PACKET_COMPOSE_FILE="${WOODRIGHT_COMPOSE_FILE:-}" \
  WR_PACKET_COMPOSE_PROJECT="${WOODRIGHT_COMPOSE_PROJECT:-}" \
  WR_PACKET_OWNERSHIP_DIR="${WOODRIGHT_OWNERSHIP_DIR:-}" \
  WR_PACKET_API_HOST="${WOODRIGHT_API_HOST:-}" \
  WR_PACKET_BUYER_HOST="${WOODRIGHT_BUYER_HOST:-}" \
  WR_PACKET_PRE_BE_REF="${PRE_BE_REF:-$LIVE_BE_REF}" \
  WR_PACKET_PRE_SF_REF="${PRE_SF_REF:-$LIVE_SF_REF}" \
  WR_PACKET_PIN_BE="$PIN_BE_VALUE" \
  WR_PACKET_PIN_SF="$PIN_SF_VALUE" \
  WR_PACKET_SKEW_BE="$SKEW_BE" \
  WR_PACKET_SKEW_SF="$SKEW_SF" \
  WR_PACKET_SKEW="$EXISTING_SKEW" \
  WR_PACKET_READY_BE_SEC="$(component_ready_deadline_sec backend "${WOODRIGHT_BE_CONTAINER_DEFAULT}")" \
  WR_PACKET_READY_SF_SEC="$(component_ready_deadline_sec storefront "${WOODRIGHT_SF_CONTAINER_DEFAULT}")" \
  WR_PACKET_POLL_SEC="$(ready_poll_interval)" \
  WR_PACKET_PRE_IMAGES_PRESENT="$(rollback_anchor_images_present && echo true || echo false)" \
  WR_PACKET_BE_SOURCE_SHA="$(packet_backend_source_sha)" \
  WR_PACKET_SF_SOURCE_SHA="$(packet_storefront_source_sha)" \
  WR_PACKET_ROLLBACK_BE_SOURCE_SHA="$(live_oci_revision "${WOODRIGHT_BE_CONTAINER_DEFAULT}")" \
  WR_PACKET_ROLLBACK_SF_SOURCE_SHA="$(live_oci_revision "${WOODRIGHT_SF_CONTAINER_DEFAULT}")" \
  WR_PACKET_ENV_BE_SOURCE_SHA="$(pin_value_of WOODRIGHT_BACKEND_SOURCE_SHA)" \
  WR_PACKET_ENV_SF_SOURCE_SHA="$(pin_value_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" \
  WR_PACKET_COMPOSE_REQUIRES_COMPONENT_SHA="$(compose_requires_component_source_sha_interpolation && echo true || echo false)" \
  python3 - "$WOODRIGHT_ENVIRONMENT" "$WOODRIGHT_ENVIRONMENT_CLASS" "$COMPONENT" "$SOURCE_SHA" "$packet_mode" \
    "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "${WOODRIGHT_SF_CONTAINER_DEFAULT}" \
    "${WOODRIGHT_MUTATION_LOCK_PATH:-}" <<'PY'
import json
import os
import re
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
be_src = os.environ.get("WR_PACKET_BE_SOURCE_SHA", "")
sf_src = os.environ.get("WR_PACKET_SF_SOURCE_SHA", "")
if re.fullmatch(r"[0-9a-f]{40}", be_src or ""):
    pin_keys["WOODRIGHT_BACKEND_SOURCE_SHA"] = be_src
if re.fullmatch(r"[0-9a-f]{40}", sf_src or ""):
    pin_keys["WOODRIGHT_STOREFRONT_SOURCE_SHA"] = sf_src
# Common release marker: only when both resulting pins prove OCI == SOURCE_SHA.
# It is last-unified-pair informational, never pair-wide identity after a split cutover.
if os.environ.get("WR_PACKET_WRITE_RELEASE_SHA", "1") == "1":
    pin_keys["WOODRIGHT_RELEASE_SHA"] = source_sha

recreate_order = ["backend", "storefront"]
image_cutover = [c for c in recreate_order if (c == "backend" and need_be) or (c == "storefront" and need_sf)]
env_refresh_only = [c for c in recreate_order if c not in image_cutover]

existing_skew = os.environ.get("WR_PACKET_SKEW", "0") == "1"
buyer_host = os.environ.get("WR_PACKET_BUYER_HOST", "").rstrip("/")
api_host = os.environ.get("WR_PACKET_API_HOST", "").rstrip("/")

packet = {
    "tool": "cutover-production-candidate.sh",
    "mode": mode,
    "environment": environment,
    "environment_class": environment_class,
    "component": component,
    "source_sha": source_sha,
    "application_source_sha": source_sha,
    "helper_install_sha": os.environ.get("WR_PACKET_HELPER_SHA", ""),
    "operation_helper_install_sha": os.environ.get("WR_PACKET_HELPER_SHA", ""),
    "sha_separation_note": (
        "application_source_sha is the OCI revision of the images; "
        "operation_helper_install_sha (alias helper_install_sha) is the ops "
        "commit that installed the helper performing this operation; "
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
            "write_order": [
                k for k in (
                    "WOODRIGHT_BACKEND_IMAGE",
                    "WOODRIGHT_STOREFRONT_IMAGE",
                    "WOODRIGHT_BACKEND_SOURCE_SHA",
                    "WOODRIGHT_STOREFRONT_SOURCE_SHA",
                    "WOODRIGHT_RELEASE_SHA",
                ) if k in pin_keys
            ],
            "atomic": "tmp on same filesystem, validated, then installed",
            "common_release_sha": source_sha if "WOODRIGHT_RELEASE_SHA" in pin_keys else None,
        },
        "recreate": {
            "order": recreate_order,
            "image_cutover": image_cutover,
            "env_refresh_only": env_refresh_only,
            "compose_file": os.environ.get("WR_PACKET_COMPOSE_FILE", ""),
            "compose_project": os.environ.get("WR_PACKET_COMPOSE_PROJECT", ""),
            # --force-recreate: Compose can consider a same-service container
            # "up to date" and leave the previous image running even though the
            # pin already moved. Forcing it makes "recreated" mean recreated.
            "flags": ["up", "-d", "--no-deps", "--force-recreate"],
            "never_recreated": ["postgres", "redis"],
        },
        "rollback_refs": {
            "backend_container_id": os.environ.get("WR_BE_CONTAINER_ID", ""),
            "backend_image": os.environ.get("WR_BE_CONTAINER_IMAGE", ""),
            "storefront_container_id": os.environ.get("WR_SF_CONTAINER_ID", ""),
            "storefront_image": os.environ.get("WR_SF_CONTAINER_IMAGE", ""),
            "pin_backup": "evidence/pin-backup/dokploy-compose.env",
            # Immutable refs the runtime would be restored to. These, together
            # with the pin backup, are the ONLY rollback authority.
            "backend_ref": os.environ.get("WR_PACKET_PRE_BE_REF", ""),
            "storefront_ref": os.environ.get("WR_PACKET_PRE_SF_REF", ""),
            "backend_source_sha": os.environ.get("WR_PACKET_ROLLBACK_BE_SOURCE_SHA", ""),
            "storefront_source_sha": os.environ.get("WR_PACKET_ROLLBACK_SF_SOURCE_SHA", ""),
            "component_source_sha_seed_authority": "live_oci_revision",
            "pre_cutover_env_backend_source_sha_present": bool(
                os.environ.get("WR_PACKET_ENV_BE_SOURCE_SHA", "").strip()
            ),
            "pre_cutover_env_storefront_source_sha_present": bool(
                os.environ.get("WR_PACKET_ENV_SF_SOURCE_SHA", "").strip()
            ),
            "compose_requires_component_source_sha_interpolation": os.environ.get(
                "WR_PACKET_COMPOSE_REQUIRES_COMPONENT_SHA", ""
            )
            == "true",
            "rollback_env_satisfies_compose_required_interpolation": bool(
                re.fullmatch(r"[0-9a-f]{40}", os.environ.get("WR_PACKET_ROLLBACK_BE_SOURCE_SHA", "") or "")
                and re.fullmatch(r"[0-9a-f]{40}", os.environ.get("WR_PACKET_ROLLBACK_SF_SOURCE_SHA", "") or "")
            ),
            "images_present_locally": os.environ.get("WR_PACKET_PRE_IMAGES_PRESENT", "") == "true",
            "method": "restore_pins_then_compose_recreate_on_previous_digests",
            "postconditions": [
                "pins_restored",
                "runtime_repo_digests_equal_restored_pins",
                "compose_release_sha_restored_from_pin_backup",
                "component_source_sha_keys_restored_from_live_oci_seed",
                "private_loopback_binds",
                "media_volume_mounted",
                "no_public_traefik",
                "minimal_loopback_http_gates",
            ],
            # WOODRIGHT_RELEASE_SHA is restored via the pin-backup env snapshot.
            # It is informational runtime identity - not an independent rollback
            # digest authority (image refs + pin backup remain authoritative).
            "release_sha_is_rollback_authority": False,
        },
        "container_recreate_uses_keepers": False,
        "health_plan": {
            "readiness": "wait_component_ready (poll, starting is transient)",
            "docker_health": recreate_order,
            "poll_interval_sec": os.environ.get("WR_PACKET_POLL_SEC", ""),
            "deadline_sec": {
                "backend": os.environ.get("WR_PACKET_READY_BE_SEC", ""),
                "storefront": os.environ.get("WR_PACKET_READY_SF_SEC", ""),
            },
            "terminal_docker_states": ["absent", "exited", "dead", "removing", "restart_loop"],
            "transient_docker_states": ["created", "starting", "unhealthy_before_deadline"],
            "http": [
                f"{api_host}/health",
                f"{buyer_host}/",
            ],
            "http_final_acceptance": [
                f"{buyer_host}/contacts",
                f"{buyer_host}/catalog",
                f"{buyer_host}/privacy",
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
            "committed|rolled_back|rollback_incomplete|failed_before_mutation",
        ],
        "exit_codes": {
            "0": "ok",
            "2": "usage/validation",
            "3": "lock",
            "4": "dry-run candidate mismatch",
            "10": "rollback_ok (postconditions verified)",
            "11": "rollback_partial (reserved, not emitted)",
            "12": "rollback_failed (pins could not be restored)",
            "13": "rollback_incomplete (pins restored, postconditions not proven)",
        },
    },
    "existing_pin_runtime_skew": existing_skew,
    "normal_execute_blocked": existing_skew,
    "compose_release_sha": {
        "current": os.environ.get("WR_PACKET_CURRENT_RELEASE_SHA", "") or None,
        "proposed": source_sha if os.environ.get("WR_PACKET_WRITE_RELEASE_SHA", "0") == "1" else None,
        "informational_drift": bool(
            os.environ.get("WR_PACKET_CURRENT_RELEASE_SHA", "")
            and os.environ.get("WR_PACKET_CURRENT_RELEASE_SHA", "") != source_sha
        ),
        "blocks_valid_pair_cutover": False,
        "is_deploy_or_rollback_authority": False,
        "note": (
            "WOODRIGHT_RELEASE_SHA is last-unified-pair informational identity "
            "(x-woodright-release-sha) and is omitted from runtime headers when "
            "backend and storefront source SHAs diverge. Authoritative runtime "
            "identity is WOODRIGHT_BACKEND_SOURCE_SHA / WOODRIGHT_STOREFRONT_SOURCE_SHA "
            "and EXPECTED_RELEASE per-component fields. Stale current values are "
            "reported as informational_drift and do not block a valid pair cutover "
            "plan; execute rewrites the marker atomically with image pins only when "
            "both OCI revisions equal application_source_sha."
        ),
    },
    "pin_runtime_comparison": {
        "backend": {
            "pin": os.environ.get("WR_PACKET_PIN_BE", ""),
            "runtime": os.environ.get("WR_PACKET_PRE_BE_REF", ""),
            "verdict": os.environ.get("WR_PACKET_SKEW_BE", "unknown"),
        },
        "storefront": {
            "pin": os.environ.get("WR_PACKET_PIN_SF", ""),
            "runtime": os.environ.get("WR_PACKET_PRE_SF_REF", ""),
            "verdict": os.environ.get("WR_PACKET_SKEW_SF", "unknown"),
        },
        "recovery_helper": "ops/release/recover-production-candidate-skew.sh",
        "blocking_token": "existing_pin_runtime_skew_requires_recovery",
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

# Pre-existing pin/runtime skew makes the compose .env a lie about the runtime,
# and that same file is the rollback anchor. Refuse before the lock, before the
# evidence dir and before any write.
if [[ "$EXISTING_SKEW" -eq 1 ]]; then
  die "existing_pin_runtime_skew_requires_recovery: compose pins do not describe the live runtime (backend pin='${PIN_BE_VALUE:-<unset>}' runtime='${LIVE_BE_REF:-<unresolved>}' verdict=$SKEW_BE; storefront pin='${PIN_SF_VALUE:-<unset>}' runtime='${LIVE_SF_REF:-<unresolved>}' verdict=$SKEW_SF) - run ops/release/recover-production-candidate-skew.sh first; a normal cutover cannot use a pin file that is not the runtime's rollback anchor"
fi

# Defined before the rollback helpers: the EXIT trap may need it from any phase.
compose_up() {
  local service="$1"
  shift
  prod_compose -f "${WOODRIGHT_COMPOSE_FILE}" --env-file "$COMPOSE_ENV_FILE" \
    --project-name "${WOODRIGHT_COMPOSE_PROJECT}" up -d --no-deps "$@" "$service"
}

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
    # Harness-only: corrupt RELEASE_SHA after a successful pin restore so the
    # incomplete-marker path can be proven (must not report false rolled_back).
    if wr_fault rollback_release_sha_mismatch; then
      log "HARNESS corrupting WOODRIGHT_RELEASE_SHA after pin restore"
      python3 - "$COMPOSE_ENV_FILE" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
new = re.sub(
    r'(?m)^([ \t]*(?:export[ \t]+)?)WOODRIGHT_RELEASE_SHA[ \t]*=.*$',
    r'\1WOODRIGHT_RELEASE_SHA=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    text,
    count=1,
)
path.write_text(new, encoding="utf-8")
PY
    fi
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
      # Content rollback from backup, then re-apply durable access contract.
      # Backups may still be root:root 0600 from pre-fix eras; never leave that.
      if ! prod_atomic_install "$backup" "$dest"; then
        rc=1
        continue
      fi
      if ! wr_prod_ownership_apply_access "$dest"; then
        log "ROLLBACK ownership access contract failed for $name"
        rc=1
      fi
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

container_name_for() {
  case "$1" in
    backend) printf '%s\n' "${WOODRIGHT_BE_CONTAINER_DEFAULT}" ;;
    *) printf '%s\n' "${WOODRIGHT_SF_CONTAINER_DEFAULT}" ;;
  esac
}

pin_key_for() {
  case "$1" in
    backend) printf '%s\n' "WOODRIGHT_BACKEND_IMAGE" ;;
    *) printf '%s\n' "WOODRIGHT_STOREFRONT_IMAGE" ;;
  esac
}

image_title_for() {
  case "$1" in
    backend) printf '%s\n' "${WOODRIGHT_REQUIRED_BE_TITLE:-woodright-backend}" ;;
    *) printf '%s\n' "${WOODRIGHT_REQUIRED_SF_TITLE:-woodright-storefront}" ;;
  esac
}

host_port_for() {
  case "$1" in
    backend) printf '%s\n' "$BE_PORT" ;;
    *) printf '%s\n' "$SF_PORT" ;;
  esac
}

# Bring one component back onto the ref the restored pin file now names.
# --force-recreate because the container currently runs the candidate image
# while the pin file already says otherwise: without it Compose may consider a
# same-service container "up to date" and leave the candidate running.
rollback_recreate_component() {
  local kind="$1" want_ref="$2"
  local name up_rc=0
  name="$(container_name_for "$kind")"
  if harness_enabled && [[ "${WOODRIGHT_CUTOVER_ROLLBACK_SKIP_RECREATE:-0}" == "1" ]]; then
    log "HARNESS rollback recreate skipped for $kind (simulating a recreate that did not take)"
    return 1
  fi
  compose_up "$kind" --force-recreate >&2 || up_rc=$?
  if [[ "$up_rc" -ne 0 ]]; then
    log "ROLLBACK $kind: compose recreate on $want_ref failed rc=$up_rc"
    return 1
  fi
  prod_docker inspect "$name" >/dev/null 2>&1 || {
    log "ROLLBACK $kind: container '$name' missing after recreate"
    return 1
  }
  log "ROLLBACK $kind: recreated on $want_ref"
  return 0
}

# Postcondition 1: the runtime RepoDigest ref must be byte-equal to the pin the
# restored compose .env now carries. This is what makes exit 10 honest.
verify_runtime_matches_pins() {
  local rc=0 kind name want got
  for kind in backend storefront; do
    name="$(container_name_for "$kind")"
    prod_docker inspect "$name" >/dev/null 2>&1 || {
      log "ROLLBACK_VERIFY $kind container '$name' absent"
      rc=1
      continue
    }
    want="$(pin_value_of "$(pin_key_for "$kind")")"
    got="$(resolve_live_ref "$name" "$(image_title_for "$kind")" "$kind")"
    if [[ -z "$want" || -z "$got" ]]; then
      log "ROLLBACK_VERIFY $kind cannot prove pin/runtime equality (pin='${want:-<unset>}' runtime='${got:-<unresolved>}')"
      rc=1
      continue
    fi
    if [[ "$want" != "$got" ]]; then
      log "ROLLBACK_VERIFY $kind MISMATCH pin=$want runtime=$got"
      rc=1
      continue
    fi
    log "ROLLBACK_VERIFY $kind ok pin==runtime==$got"
  done
  return "$rc"
}

# Postcondition 1b: restored WOODRIGHT_RELEASE_SHA must match the pin-backup
# snapshot. Image digests alone are not enough - a mixed marker is incomplete.
verify_rollback_component_source_shas() {
  local backup="$EVIDENCE_DIR/pin-backup/dokploy-compose.env"
  local want got live
  [[ -f "$backup" ]] || {
    log "ROLLBACK_VERIFY component SOURCE_SHA backup missing"
    return 1
  }
  want="$(awk -F= '$1=="WOODRIGHT_BACKEND_SOURCE_SHA" {sub(/^[^=]*=/, ""); print; exit}' "$backup" 2>/dev/null || true)"
  got="$(pin_value_of WOODRIGHT_BACKEND_SOURCE_SHA)"
  [[ "$want" =~ ^[0-9a-f]{40}$ ]] || {
    log "ROLLBACK_VERIFY WOODRIGHT_BACKEND_SOURCE_SHA missing/malformed in backup"
    return 1
  }
  [[ "$got" == "$want" ]] || {
    log "ROLLBACK_VERIFY WOODRIGHT_BACKEND_SOURCE_SHA MISMATCH want=$want got=${got:-<unset>}"
    return 1
  }
  live="$(live_oci_revision "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
  [[ "$live" == "$got" ]] || {
    log "ROLLBACK_VERIFY backend SOURCE_SHA != live OCI revision env=$got live=${live:-<unset>}"
    return 1
  }
  want="$(awk -F= '$1=="WOODRIGHT_STOREFRONT_SOURCE_SHA" {sub(/^[^=]*=/, ""); print; exit}' "$backup" 2>/dev/null || true)"
  got="$(pin_value_of WOODRIGHT_STOREFRONT_SOURCE_SHA)"
  [[ "$want" =~ ^[0-9a-f]{40}$ ]] || {
    log "ROLLBACK_VERIFY WOODRIGHT_STOREFRONT_SOURCE_SHA missing/malformed in backup"
    return 1
  }
  [[ "$got" == "$want" ]] || {
    log "ROLLBACK_VERIFY WOODRIGHT_STOREFRONT_SOURCE_SHA MISMATCH want=$want got=${got:-<unset>}"
    return 1
  }
  live="$(live_oci_revision "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
  [[ "$live" == "$got" ]] || {
    log "ROLLBACK_VERIFY storefront SOURCE_SHA != live OCI revision env=$got live=${live:-<unset>}"
    return 1
  }
  log "ROLLBACK_VERIFY component SOURCE_SHA ok backend=$got storefront=$(pin_value_of WOODRIGHT_STOREFRONT_SOURCE_SHA)"
  return 0
}

verify_rollback_release_sha() {
  local backup="$EVIDENCE_DIR/pin-backup/dokploy-compose.env"
  local want got
  [[ -f "$backup" ]] || {
    log "ROLLBACK_VERIFY RELEASE_SHA backup missing"
    return 1
  }
  want="$(awk -F= '$1=="WOODRIGHT_RELEASE_SHA" {sub(/^[^=]*=/, ""); print; exit}' "$backup" 2>/dev/null || true)"
  got="$(pin_value_of WOODRIGHT_RELEASE_SHA)"
  if [[ -z "$want" ]]; then
    # Pre-cutover env had no marker - restored env must also lack it (or be empty).
    if [[ -z "$got" ]]; then
      log "ROLLBACK_VERIFY RELEASE_SHA ok (absent in backup and live)"
      return 0
    fi
    log "ROLLBACK_VERIFY RELEASE_SHA unexpected live marker after backup without key"
    return 1
  fi
  if [[ "$got" != "$want" ]]; then
    log "ROLLBACK_VERIFY RELEASE_SHA MISMATCH want=$want got=${got:-<unset>} - NOT reporting ROLLBACK_OK"
    return 1
  fi
  log "ROLLBACK_VERIFY RELEASE_SHA ok restored=$got"
  return 0
}

# Postcondition 2: the stack is still the private candidate we started from.
verify_rollback_exposure() {
  local rc=0 kind name
  for kind in backend storefront; do
    name="$(container_name_for "$kind")"
    prod_docker inspect "$name" >/dev/null 2>&1 || { rc=1; continue; }
    assert_private_binds "$name" "$(host_port_for "$kind")" >&2 || rc=1
    assert_no_public_traefik "$name" >&2 || rc=1
  done
  assert_media_volume >&2 || rc=1
  return "$rc"
}

# Postcondition 3: minimal loopback HTTP gates on the restored runtime.
verify_rollback_http() {
  local rc=0
  http_gate rollback-backend "${WOODRIGHT_API_HOST%/}/health" || rc=1
  http_gate rollback-storefront "${WOODRIGHT_BUYER_HOST%/}/" || rc=1
  return "$rc"
}

run_rollback() {
  if [[ "$ROLLBACK_DONE" == "1" ]]; then
    log "ROLLBACK already performed - not repeating"
    return "$ROLLBACK_RC"
  fi
  ROLLBACK_DONE=1
  log "ROLLBACK begin phase=$PHASE recreated=[${COMPONENTS_RECREATED# }] method=restore_pins_then_compose_recreate (no keepers)"
  local pin_ok=1 runtime_ok=1 verify_ok=1 release_ok=1 component_sha_ok=1 exposure_ok=1 http_ok=1 meta_ok=1
  local kind name want deadline

  restore_pins || pin_ok=0

  if [[ "$pin_ok" == "1" ]]; then
    # Backend first, then storefront - the same dependency order as forward.
    for kind in backend storefront; do
      component_in_scope "$kind" || continue
      name="$(container_name_for "$kind")"
      want="$(pin_value_of "$(pin_key_for "$kind")")"
      if [[ -z "$want" ]]; then
        log "ROLLBACK $kind: restored pin file has no $(pin_key_for "$kind") value"
        runtime_ok=0
        continue
      fi
      if [[ "$(resolve_live_ref "$name" "$(image_title_for "$kind")" "$kind")" == "$want" ]]; then
        log "ROLLBACK $kind: already on $want - no recreate needed"
        continue
      fi
      if ! rollback_recreate_component "$kind" "$want"; then
        runtime_ok=0
        continue
      fi
      deadline="$(component_ready_deadline_sec "$kind" "$name")"
      if ! wait_component_ready "$kind" "$name" "$deadline" rollback; then
        log "ROLLBACK $kind: restored container did not become ready"
        runtime_ok=0
      fi
    done
  else
    runtime_ok=0
  fi

  if [[ "$METADATA_WRITTEN" == "1" ]]; then
    restore_ownership_metadata || meta_ok=0
  fi

  # Postconditions - evaluated even when an earlier step already failed, so the
  # evidence records exactly what is and is not true.
  verify_runtime_matches_pins || verify_ok=0
  verify_rollback_release_sha || release_ok=0
  verify_rollback_component_source_shas || component_sha_ok=0
  verify_rollback_exposure || exposure_ok=0
  verify_rollback_http || http_ok=0

  if [[ -n "$EVIDENCE_DIR" && -d "$EVIDENCE_DIR/json" ]]; then
    printf '{"phase_at_rollback":"%s","method":"restore_pins_then_compose_recreate","keepers_used":false,"pins":%s,"runtime_recreate":%s,"pins_equal_runtime":%s,"release_sha":%s,"component_source_sha":%s,"exposure":%s,"http":%s,"metadata":%s,"pre_backend_ref":"%s","pre_storefront_ref":"%s","pre_release_sha":"%s"}\n' \
      "$PHASE" "$pin_ok" "$runtime_ok" "$verify_ok" "$release_ok" "$component_sha_ok" "$exposure_ok" "$http_ok" "$meta_ok" \
      "$PRE_BE_REF" "$PRE_SF_REF" "${PRE_RELEASE_SHA}" >"$EVIDENCE_DIR/json/rollback-result.json" 2>/dev/null || true
  fi

  if [[ "$pin_ok" == "1" && "$runtime_ok" == "1" && "$verify_ok" == "1" \
     && "$release_ok" == "1" && "$component_sha_ok" == "1" \
     && "$exposure_ok" == "1" && "$http_ok" == "1" && "$meta_ok" == "1" ]]; then
    ROLLBACK_RC=10
    record_state rolled_back
    log "ROLLBACK_OK (pins restored, runtime digests == pins, RELEASE_SHA restored, component SOURCE_SHA restored from live OCI seed, private binds, media volume, no public Traefik, HTTP gates)"
    return "$ROLLBACK_RC"
  fi

  if [[ "$pin_ok" != "1" ]]; then
    ROLLBACK_RC=12
    record_state rollback_incomplete
    log "ROLLBACK_FAILED pins could not be restored - runtime and pins are both unproven; treat as an open incident"
    return "$ROLLBACK_RC"
  fi

  ROLLBACK_RC=13
  record_state rollback_incomplete
  log "ROLLBACK_INCOMPLETE pins=$pin_ok runtime_recreate=$runtime_ok pins_equal_runtime=$verify_ok release_sha=$release_ok component_source_sha=$component_sha_ok exposure=$exposure_ok http=$http_ok metadata=$meta_ok - NOT reporting ROLLBACK_OK"
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
    # run_rollback owns the terminal state (rolled_back | rollback_incomplete)
    # and the exit code (10 | 12 | 13). Never overwrite either here: an
    # incomplete rollback must not be re-labelled as rolled_back.
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

# --- rollback anchors (captured before the first write) ---------------------
# The exact immutable refs the containers are running RIGHT NOW. Every in-scope
# anchor must also be present in the local image store, otherwise a rollback
# could not recreate anything and we must refuse before mutating.
capture_rollback_anchors() {
  local kind name title ref present scope
  local be_present=false sf_present=false
  for kind in backend storefront; do
    name="$(container_name_for "$kind")"
    title="$(image_title_for "$kind")"
    ref=""
    present=false
    if prod_docker inspect "$name" >/dev/null 2>&1; then
      ref="$(resolve_live_ref "$name" "$title" "$kind")"
    fi
    if [[ -n "$ref" ]] && prod_docker image inspect "$ref" >/dev/null 2>&1; then
      present=true
    fi
    if component_in_scope "$kind"; then
      [[ -n "$ref" ]] || die "cannot resolve the live $kind RepoDigest ref - refusing to mutate without a rollback anchor"
      [[ "$present" == "true" ]] \
        || die "rollback anchor image is not present locally: $ref (execute never pulls - refusing before any write)"
      local pinned
      pinned="$(pin_value_of "$(pin_key_for "$kind")")"
      [[ "$pinned" == "$ref" ]] \
        || die "rollback anchor disagrees with the compose pin for $kind (pin='${pinned:-<unset>}' runtime='$ref') - existing_pin_runtime_skew_requires_recovery"
    else
      [[ -n "$ref" ]] || die "cannot resolve the live peer $kind RepoDigest ref - env refresh requires a CAS live identity"
      [[ "$present" == "true" ]] \
        || die "peer $kind image is not present locally: $ref (env refresh never pulls - refusing before any write)"
    fi
    if [[ "$kind" == "backend" ]]; then
      PRE_BE_REF="$ref"; be_present="$present"
    else
      PRE_SF_REF="$ref"; sf_present="$present"
    fi
  done
  PRE_RELEASE_SHA="$(pin_value_of WOODRIGHT_RELEASE_SHA)"
  scope="$COMPONENT"
  printf '{"method":"restore_pins_then_compose_recreate","keepers_used":false,"component_scope":"%s","captured_at_utc":"%s","pre_release_sha":"%s","backend":{"ref":"%s","container_id":"%s","started_at":"%s","image_present_locally":%s},"storefront":{"ref":"%s","container_id":"%s","started_at":"%s","image_present_locally":%s}}\n' \
    "$scope" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${PRE_RELEASE_SHA}" \
    "$PRE_BE_REF" "$(container_id "${WOODRIGHT_BE_CONTAINER_DEFAULT}")" "$(container_started_at "${WOODRIGHT_BE_CONTAINER_DEFAULT}")" "$be_present" \
    "$PRE_SF_REF" "$(container_id "${WOODRIGHT_SF_CONTAINER_DEFAULT}")" "$(container_started_at "${WOODRIGHT_SF_CONTAINER_DEFAULT}")" "$sf_present" \
    >"$EVIDENCE_DIR/json/rollback-anchors.json"
  log "rollback anchors backend=${PRE_BE_REF:-n/a} storefront=${PRE_SF_REF:-n/a} release_sha=${PRE_RELEASE_SHA:-n/a} (verified present locally; no keepers)"
}
capture_rollback_anchors

# Canonical compose interpolates ${WOODRIGHT_*_SOURCE_SHA:?required}. A pre-PR-207
# .env snapshot may omit those keys. Seed the pin-backup (not live .env) with the
# currently running OCI revisions so rollback compose recreate cannot fail-closed
# on missing required interpolation.
ensure_pin_backup_component_source_shas() {
  local backup="$EVIDENCE_DIR/pin-backup/dokploy-compose.env"
  local be_sha sf_sha
  [[ -f "$backup" ]] || die "pin backup missing before component SHA seed"
  be_sha="$(live_oci_revision "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
  sf_sha="$(live_oci_revision "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
  [[ "$be_sha" =~ ^[0-9a-f]{40}$ ]] || die "cannot seed backup: live backend OCI revision missing"
  [[ "$sf_sha" =~ ^[0-9a-f]{40}$ ]] || die "cannot seed backup: live storefront OCI revision missing"
  python3 - "$backup" "$be_sha" "$sf_sha" <<'PY'
import re, sys
path, be_sha, sf_sha = sys.argv[1:4]
sha40 = re.compile(r"^[0-9a-f]{40}$")
if not sha40.fullmatch(be_sha) or not sha40.fullmatch(sf_sha):
    raise SystemExit("invalid live revision while seeding pin backup")
text = open(path, "r", encoding="utf-8").read()
lines = text.splitlines()
wanted = {
    "WOODRIGHT_BACKEND_SOURCE_SHA": be_sha,
    "WOODRIGHT_STOREFRONT_SOURCE_SHA": sf_sha,
}
out = []
seen = set()
for line in lines:
    key = line.split("=", 1)[0].strip() if "=" in line else ""
    if key in wanted:
        seen.add(key)
        val = line.split("=", 1)[1]
        stripped = val.strip().strip('"').strip("'")
        if stripped and not sha40.fullmatch(stripped):
            raise SystemExit(f"pin backup {key} is not a 40-hex SHA")
        if not stripped:
            out.append(f"{key}={wanted[key]}")
        elif stripped != wanted[key]:
            raise SystemExit(
                f"pin backup {key} disagrees with live OCI revision"
            )
        else:
            out.append(line)
        continue
    out.append(line)
for key, val in wanted.items():
    if key not in seen:
        out.append(f"{key}={val}")
open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
PY
  sha256_of "$backup" >"$EVIDENCE_DIR/pin-backup/dokploy-compose.env.sha256"
  log "pin-backup component SOURCE_SHA keys seeded from live OCI revisions (backup only; live .env unchanged until pin write)"
}
ensure_pin_backup_component_source_shas

resolve_pair_expected_identities

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

# Atomic pin install for the required component set: render image keys for the
# mutated component, ALWAYS both WOODRIGHT_*_SOURCE_SHA keys (mutated = SOURCE_SHA,
# peer = CAS live OCI), and (when both pins prove OCI==SOURCE_SHA) WOODRIGHT_RELEASE_SHA
# into one temp file, validate the whole file, arm rollback (PHASE=pins_written)
# BEFORE the single install, then install once.
# This closes the mixed-pin window where a signal could land after the
# first key replace but before record_state.
write_required_pins_atomic() {
  local tmp be_want sf_want write_release=0 be_src sf_src
  local -a render_args=() validate_args=()
  local compose_parent
  be_want="$(pin_value_of WOODRIGHT_BACKEND_IMAGE)"
  sf_want="$(pin_value_of WOODRIGHT_STOREFRONT_IMAGE)"
  need_be && be_want="$BE_REF"
  need_sf && sf_want="$SF_REF"
  be_src="$(packet_backend_source_sha)"
  sf_src="$(packet_storefront_source_sha)"
  is_sha40 "$be_src" || { log "missing/invalid WOODRIGHT_BACKEND_SOURCE_SHA"; return 1; }
  is_sha40 "$sf_src" || { log "missing/invalid WOODRIGHT_STOREFRONT_SOURCE_SHA"; return 1; }

  compose_parent="$(dirname -- "$COMPOSE_ENV_FILE")"
  allowed_root="${WOODRIGHT_DOKPLOY_COMPOSE_DIR:-$compose_parent}"
  wr_compose_env_assert_path_under "$COMPOSE_ENV_FILE" "$allowed_root" || return 1
  wr_compose_env_assert_no_duplicate_governed_keys "$COMPOSE_ENV_FILE" || return 1

  if should_write_common_release_sha; then
    write_release=1
  fi

  tmp="$(mktemp "${compose_parent}/.wr-prod-pin-XXXXXX" 2>/dev/null || true)"
  if [[ -z "$tmp" ]]; then
    log "NOTE pin tmp falls back to the evidence dir (compose dir not writable by this user)"
    tmp="$(mktemp "$EVIDENCE_DIR/pin-backup/.wr-prod-pin-XXXXXX")"
  fi
  [[ ! -L "$tmp" ]] || { rm -f "$tmp"; return 1; }
  cp -p "$COMPOSE_ENV_FILE" "$tmp" || { rm -f "$tmp"; return 1; }

  need_be && render_args+=(WOODRIGHT_BACKEND_IMAGE "$BE_REF")
  need_sf && render_args+=(WOODRIGHT_STOREFRONT_IMAGE "$SF_REF")
  render_args+=(WOODRIGHT_BACKEND_SOURCE_SHA "$be_src")
  render_args+=(WOODRIGHT_STOREFRONT_SOURCE_SHA "$sf_src")
  if [[ "$write_release" -eq 1 ]]; then
    render_args+=(WOODRIGHT_RELEASE_SHA "$SOURCE_SHA")
  fi
  [[ "${#render_args[@]}" -gt 0 ]] || { rm -f "$tmp"; return 1; }

  if ! wr_compose_env_render_keys "$tmp" "${tmp}.next" "${render_args[@]}"; then
    rm -f "$tmp" "${tmp}.next"
    return 1
  fi
  mv -f "${tmp}.next" "$tmp" || { rm -f "$tmp" "${tmp}.next"; return 1; }

  need_be && validate_args+=(WOODRIGHT_BACKEND_IMAGE "$BE_REF")
  need_sf && validate_args+=(WOODRIGHT_STOREFRONT_IMAGE "$SF_REF")
  validate_args+=(WOODRIGHT_BACKEND_SOURCE_SHA "$be_src")
  validate_args+=(WOODRIGHT_STOREFRONT_SOURCE_SHA "$sf_src")
  if [[ "$write_release" -eq 1 ]]; then
    validate_args+=(WOODRIGHT_RELEASE_SHA "$SOURCE_SHA")
  fi
  # Sibling pins must remain exact when we did not rewrite them.
  if need_be && ! need_sf; then
    validate_args+=(WOODRIGHT_STOREFRONT_IMAGE "$sf_want")
  fi
  if need_sf && ! need_be; then
    validate_args+=(WOODRIGHT_BACKEND_IMAGE "$be_want")
  fi

  if ! wr_compose_env_validate_keys "$tmp" "${validate_args[@]}" >&2; then
    rm -f "$tmp"
    return 1
  fi
  wr_compose_env_assert_no_duplicate_governed_keys "$tmp" || { rm -f "$tmp"; return 1; }

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
  PINS_WRITTEN="${PINS_WRITTEN} WOODRIGHT_BACKEND_SOURCE_SHA WOODRIGHT_STOREFRONT_SOURCE_SHA"
  printf '%s WOODRIGHT_BACKEND_SOURCE_SHA=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$be_src" >>"$EVIDENCE_DIR/json/pins-written.txt"
  printf '%s WOODRIGHT_STOREFRONT_SOURCE_SHA=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sf_src" >>"$EVIDENCE_DIR/json/pins-written.txt"
  if [[ "$write_release" -eq 1 ]]; then
    PINS_WRITTEN="${PINS_WRITTEN} WOODRIGHT_RELEASE_SHA"
    printf '%s WOODRIGHT_RELEASE_SHA=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SOURCE_SHA" >>"$EVIDENCE_DIR/json/pins-written.txt"
  fi
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
# Forward recreate never renames the live container aside. A renamed container
# keeps its com.docker.compose.* labels, so the very next `compose up` for the
# same project/service treats it as the service's container and may exit 0
# without creating the canonical name (or --force-recreate adopts/destroys the
# keeper). Rollback authority is the pin backup plus PRE_*_REF instead.
# Always --force-recreate: plain `up` is a no-op when digests already match
# (identity reconcile refreshing RELEASE_SHA/env) and Compose exit 0 is not
# proof of a new container.
recreate_component() {
  local kind="$1"
  local name want_digest fault prev_id up_rc=0 want_ref
  if [[ "$kind" == "backend" ]]; then
    name="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
    want_ref="${EXPECT_BE_REF}"
    fault="backend_recreate"
  else
    name="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
    want_ref="${EXPECT_SF_REF}"
    fault="storefront_recreate"
  fi
  want_digest="${want_ref##*@}"
  [[ "$want_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
    log "$kind: missing expected digest for recreate"
    return 1
  }
  prev_id="$(prod_docker inspect --format '{{.Id}}' "$name" 2>/dev/null || true)"
  compose_up "$kind" --force-recreate >&2 || up_rc=$?
  if wr_fault "$fault"; then up_rc=1; fi
  if [[ "$up_rc" -ne 0 ]]; then
    log "$kind: compose up --force-recreate failed rc=$up_rc"
    return 1
  fi
  if ! wr_compose_verify_recreate_postconditions \
      "$kind" "$name" "$prev_id" "$want_digest" "${WOODRIGHT_COMPOSE_PROJECT}"; then
    log "$kind: recreate postconditions failed"
    return 1
  fi
  if ! wr_compose_assert_no_service_owned_keeper \
      "${WOODRIGHT_COMPOSE_PROJECT}" "$kind" "$name"; then
    log "$kind: compose service still owned by a non-canonical container"
    return 1
  fi
  local got
  got="$(container_digest "$name")"
  if wr_fault wrong_digest_after_recreate; then got="sha256:$(printf '0%.0s' {1..64})"; fi
  if [[ "$got" != "$want_digest" ]]; then
    log "$kind: digest mismatch after recreate have=$got want=$want_digest"
    return 1
  fi
  COMPONENTS_RECREATED="${COMPONENTS_RECREATED} ${kind}"
  log "$kind: recreated at $want_digest (force_recreate=1, no keeper container created)"
  return 0
}

if ! recreate_component backend; then
  die "backend recreate failed"
fi
if ! recreate_component storefront; then
  die "storefront recreate failed"
fi
record_state containers_recreated

# --- readiness --------------------------------------------------------------
# Docker health "starting" is the NORMAL state of a freshly recreated container
# (backend --start-period=60s, storefront --start-period=40s), so readiness is
# polled to a deadline instead of read once. Both services are always recreated
# (image cutover and/or identity-env refresh), so both must pass readiness.
BE_DEADLINE="$(component_ready_deadline_sec backend "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
log "readiness plan backend deadline=${BE_DEADLINE}s poll=$(ready_poll_interval)s"
if wr_fault backend_health \
   || ! wait_component_ready backend "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "$BE_DEADLINE"; then
  die "backend readiness gate failed"
fi
if wr_fault backend_http; then
  die "backend HTTP gate failed"
fi
SF_DEADLINE="$(component_ready_deadline_sec storefront "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
log "readiness plan storefront deadline=${SF_DEADLINE}s poll=$(ready_poll_interval)s"
if wr_fault storefront_health \
   || ! wait_component_ready storefront "${WOODRIGHT_SF_CONTAINER_DEFAULT}" "$SF_DEADLINE"; then
  die "storefront readiness gate failed"
fi
if wr_fault storefront_http; then
  die "storefront HTTP gate failed"
fi
record_state health_passed

# --- acceptance -------------------------------------------------------------
if wr_fault public_bind; then
  die "acceptance failed: public bind detected after recreate"
fi
if wr_fault public_traefik; then
  die "acceptance failed: public Traefik label detected after recreate"
fi
assert_private_binds "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "$BE_PORT" >&2 || die "acceptance failed: backend bind is not private"
assert_no_public_traefik "${WOODRIGHT_BE_CONTAINER_DEFAULT}" >&2 || die "acceptance failed: backend Traefik exposure"
wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend \
  || die "acceptance failed: backend no longer matches the production profile"
assert_private_binds "${WOODRIGHT_SF_CONTAINER_DEFAULT}" "$SF_PORT" >&2 || die "acceptance failed: storefront bind is not private"
assert_no_public_traefik "${WOODRIGHT_SF_CONTAINER_DEFAULT}" >&2 || die "acceptance failed: storefront Traefik exposure"
wr_assert_container_matches_environment "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront \
  || die "acceptance failed: storefront no longer matches the production profile"
assert_media_volume >&2 || die "acceptance failed: media volume gate"

# Final acceptance HTTP gates. Readiness above already proved `/health` and `/`
# once each; these are the recorded, required gates for the committed release.
# Both services are always recreated, so both HTTP surfaces are required.
http_gate backend "${WOODRIGHT_API_HOST%/}/health" || die "acceptance failed: backend HTTP gate"
http_gate storefront "${WOODRIGHT_BUYER_HOST%/}/" || die "acceptance failed: storefront HTTP gate"
for sf_route in /contacts /catalog /privacy; do
  http_gate "storefront${sf_route}" "${WOODRIGHT_BUYER_HOST%/}${sf_route}" \
    || die "acceptance failed: storefront route gate ${sf_route}"
done
record_state acceptance_passed

# --- scoped ownership metadata (ACTIVE only after health + gates) -----------
write_ownership_metadata() {
  local dir="${WOODRIGHT_OWNERSHIP_DIR%/}"
  [[ -n "$dir" ]] || { log "ownership dir unset"; return 1; }
  recheck_untouched_peer_before_metadata
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
  WR_META_BE_REF="$EXPECT_BE_REF" \
  WR_META_SF_REF="$EXPECT_SF_REF" \
  WR_META_BE_SHA="$EXPECT_BE_SHA" \
  WR_META_SF_SHA="$EXPECT_SF_SHA" \
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
be_sha = os.environ.get("WR_META_BE_SHA", "")
sf_sha = os.environ.get("WR_META_SF_SHA", "")

import re
DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
if not be_ref or "@" not in be_ref or not DIGEST_RE.match(be_ref.split("@")[-1]):
    raise SystemExit("ownership writer refused empty/malformed backend identity")
if not sf_ref or "@" not in sf_ref or not DIGEST_RE.match(sf_ref.split("@")[-1]):
    raise SystemExit("ownership writer refused empty/malformed storefront identity")
if not SHA_RE.match(be_sha) or not SHA_RE.match(sf_sha):
    raise SystemExit("ownership writer refused empty/malformed component source SHA")

common = {
    "environment": os.environ["WR_META_ENV"],
    "environment_class": os.environ["WR_META_CLASS"],
    "component": component,
    # Two distinct provenance fields - the helper SHA is never the release SHA.
    "application_source_sha": app_sha,
    "helper_install_sha": helper_sha,
    "operation_helper_install_sha": helper_sha,
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
        backend_digest=be_ref.split("@")[-1],
        backend_source_sha=be_sha,
        storefront_image=sf_ref,
        storefront_digest=sf_ref.split("@")[-1],
        storefront_source_sha=sf_sha,
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
    # Durable operator-readable contract (root:woodright-ops 0640). Fail closed.
    if ! wr_prod_ownership_apply_access "$dest"; then
      log "ownership access contract failed for $name (required root:woodright-ops 0640)"
      return 1
    fi
  done

  log "ownership metadata written under $dir (application_source_sha=$SOURCE_SHA helper_install_sha=${HELPER_INSTALL_SHA:-<empty>})"
  return 0
}

if ! write_ownership_metadata; then
  die "scoped ownership metadata write failed"
fi

# Authority matrix postcondition: component source SHA pins always match CAS
# identities. WOODRIGHT_RELEASE_SHA is last-unified-pair only: write/require it
# when both component identities equal SOURCE_SHA (pair cutover OR a
# component-only cutover that happens to unify the pair). Omit/do not rewrite
# it when EXPECT_BE_SHA != EXPECT_SF_SHA.
[[ "$(pin_value_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$EXPECT_BE_SHA" ]] \
  || die "authority postcondition failed: WOODRIGHT_BACKEND_SOURCE_SHA must equal CAS backend identity"
[[ "$(pin_value_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" == "$EXPECT_SF_SHA" ]] \
  || die "authority postcondition failed: WOODRIGHT_STOREFRONT_SOURCE_SHA must equal CAS storefront identity"
if [[ "$EXPECT_BE_SHA" == "$EXPECT_SF_SHA" ]]; then
  [[ "$EXPECT_BE_SHA" == "$SOURCE_SHA" ]] \
    || die "authority postcondition failed: unified component SHAs must equal SOURCE_SHA"
  [[ "$(pin_value_of WOODRIGHT_RELEASE_SHA)" == "$SOURCE_SHA" ]] \
    || die "authority postcondition failed: unified pair must pin WOODRIGHT_RELEASE_SHA to SOURCE_SHA"
else
  should_write_common_release_sha \
    && die "authority postcondition failed: split pair must not write WOODRIGHT_RELEASE_SHA"
fi
wr_compose_env_assert_no_duplicate_governed_keys "$COMPOSE_ENV_FILE" \
  || die "authority postcondition failed: duplicate governed compose keys"

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
  echo "- rollback anchor backend: ${PRE_BE_REF:-n/a}"
  echo "- rollback anchor storefront: ${PRE_SF_REF:-n/a}"
  echo "- keeper containers: none (rollback anchors on pins + immutable refs)"
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
