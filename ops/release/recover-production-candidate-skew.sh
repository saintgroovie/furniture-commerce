#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Recovery helper for a PRIVATE production-candidate stack whose compose .env
# image pins no longer describe the running containers ("pin/runtime skew").
#
# Skew is not a cutover: the normal helper
# ops/release/cutover-production-candidate.sh refuses to run against it
# (existing_pin_runtime_skew_requires_recovery), because the pin file it would
# back up is also its rollback anchor, and an anchor that does not describe the
# runtime cannot roll anything back.
#
# NOT a public woodright.ru cutover, NOT a DNS/Traefik/CDN change, and NOT the
# public_demo pair cutover. The only accepted --environment is "production".
#
# Two recovery modes - both converge pins, runtime and ownership metadata on a
# single pair of immutable refs:
#
#   adopt-live-candidates    (preferred when the live containers are the
#                            intended release and are healthy)
#     Containers are NOT recreated. The pins are moved forward onto the refs
#     the runtime already runs, then ACTIVE_OWNER / EXPECTED_RELEASE /
#     ACTIVE_RELEASE are rewritten to match. Zero buyer-visible restart.
#
#   restore-pinned-runtime   (when the live candidates must be abandoned)
#     The pins stay/return at the pinned refs and the runtime is recreated onto
#     them (backend then storefront, --no-deps --force-recreate), then ownership
#     metadata is written for the pinned pair.
#
# Canonical lock (execute only): /srv/woodright/locks/production/live-cutover.lock
# taken with flock through ops/lib/woodright-staging-mutation-lock.sh - the same
# lock the cutover helper takes, so the two can never interleave.
#
# TWO DISTINCT SHAs - never conflate them:
#   application_source_sha = --application-source-sha, the OCI revision baked
#                            into the images that end up live
#   helper_install_sha     = the ops commit that installed THIS script
#                            (WOODRIGHT_HELPER_INSTALL_SHA, else
#                            /srv/woodright/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt,
#                            else empty)
#
# Usage:
#   ops/release/recover-production-candidate-skew.sh \
#     --environment production \
#     --recovery-mode adopt-live-candidates|restore-pinned-runtime \
#     --application-source-sha <40hex> \
#     --live-storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:<64hex> \
#     --live-backend-ref     ghcr.io/saintgroovie/woodright-backend@sha256:<64hex> \
#     --pinned-storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:<64hex> \
#     --pinned-backend-ref    ghcr.io/saintgroovie/woodright-backend@sha256:<64hex> \
#     [--dry-run | --execute]                    # default dry-run
#     [--confirm-mutation I_UNDERSTAND_PRODUCTION_PIN_RUNTIME_SKEW_RECOVERY]
#
# All four refs are required in both modes: recovery is only safe when the
# operator states, in immutable digest form, both what is running and what is
# pinned. Mutable tags and short SHAs fail closed.
#
# Dry-run (default): read-only. Verifies everything the execute path verifies,
# prints one non-secret JSON packet and exits 0 (4 on a verification mismatch).
# Holds no lock, writes no pins, writes no ownership metadata, recreates nothing.
#
# Phase state machine (persisted in the evidence dir):
#   prepared -> pins_written -> metadata_written -> recovery_committed
#            | recovery_incomplete | failed_before_mutation
#
# There is deliberately NO pin rollback after the pin write in
# adopt-live-candidates: restoring the stale pins would recreate exactly the
# skew this helper exists to remove. A post-pin failure is reported as
# recovery_incomplete (exit 14) with the precise remaining step.
#
# Exit codes:
#   0 ok | 2 usage/validation | 3 lock | 4 dry-run verification mismatch
#   14 recovery_incomplete (pins moved, later step unproven)
#   15 recovery_runtime_restore_failed (restore-pinned-runtime could not put the
#      runtime on the pinned refs)
#
# Fidelity coverage:
#   scripts/ops/test-production-candidate-skew-recovery-fidelity.sh
# Operator context: docs/operator/production-candidate-rollback.md
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

EXECUTE_CONFIRM_TOKEN="I_UNDERSTAND_PRODUCTION_PIN_RUNTIME_SKEW_RECOVERY"
CANONICAL_LOCK_PATH="/srv/woodright/locks/production/live-cutover.lock"
HELPER_SHA_FILE_DEFAULT="/srv/woodright/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
BUILD_PROFILE_EXPECTED="production_candidate"
WR_FIELD_SEP="~@~"

MODE="dry-run"
MODE_REQUESTS=""
RECOVERY_MODE=""
SOURCE_SHA=""
LIVE_SF_REF=""
LIVE_BE_REF=""
PINNED_SF_REF=""
PINNED_BE_REF=""
CONFIRM=""

HELPER_INSTALL_SHA=""
EVIDENCE_DIR=""
PHASE="init"
MISMATCH=0
PINS_INSTALLED=0
METADATA_INSTALLED=0
COMMITTED=0
# Set once a terminal state has already been recorded on purpose, so the EXIT
# trap never relabels it (an incomplete recovery must not become "failed before
# mutation", and a committed one must never be undone by a late signal).
FINAL_STATE_RECORDED=0
TS_RUN="$(date -u +%Y%m%dT%H%M%SZ)"

READY_DEADLINE_BE_DEFAULT=180
READY_DEADLINE_SF_DEFAULT=150
READY_POLL_INTERVAL_DEFAULT=2
READY_RESTART_LOOP_THRESHOLD=3

# Frozen runtime facts, captured under the lock before any write.
FREEZE_BE_ID=""
FREEZE_SF_ID=""
FREEZE_BE_STARTED=""
FREEZE_SF_STARTED=""
FREEZE_BE_REF=""
FREEZE_SF_REF=""

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 2; }

usage() {
  cat <<'EOF'
Usage: recover-production-candidate-skew.sh --environment production --recovery-mode <adopt-live-candidates|restore-pinned-runtime> --application-source-sha <40hex> [options]

Required:
  --environment production            (only "production"; public_demo/staging refused)
  --recovery-mode adopt-live-candidates|restore-pinned-runtime
  --application-source-sha <40hex>    (application OCI revision - NOT the helper install SHA)
  --live-storefront-ref  ghcr.io/...@sha256:<64hex>   (what storefront runs NOW)
  --live-backend-ref     ghcr.io/...@sha256:<64hex>   (what backend runs NOW)
  --pinned-storefront-ref ghcr.io/...@sha256:<64hex>  (what the compose .env pins now)
  --pinned-backend-ref    ghcr.io/...@sha256:<64hex>  (what the compose .env pins now)

Optional:
  --dry-run | --execute       (default dry-run; --mode dry-run|execute also accepted)
  --confirm-mutation <token>  (execute only: I_UNDERSTAND_PRODUCTION_PIN_RUNTIME_SKEW_RECOVERY)

adopt-live-candidates : pins move onto the live refs; containers are NOT recreated.
restore-pinned-runtime: runtime is recreated onto the pinned refs (backend, then storefront).

Dry-run: read-only. No lock held, no pin writes, no recreate, no ACTIVE/EXPECTED writes.

Exit codes: 0 ok | 2 validation | 3 lock | 4 dry-run mismatch
            14 recovery_incomplete | 15 recovery_runtime_restore_failed
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
      --recovery-mode) RECOVERY_MODE="${2:?}"; shift 2 ;;
      --recovery-mode=*) RECOVERY_MODE="${1#--recovery-mode=}"; shift ;;
      --application-source-sha) SOURCE_SHA="${2:?}"; shift 2 ;;
      --application-source-sha=*) SOURCE_SHA="${1#--application-source-sha=}"; shift ;;
      --live-storefront-ref) LIVE_SF_REF="${2:?}"; shift 2 ;;
      --live-storefront-ref=*) LIVE_SF_REF="${1#--live-storefront-ref=}"; shift ;;
      --live-backend-ref) LIVE_BE_REF="${2:?}"; shift 2 ;;
      --live-backend-ref=*) LIVE_BE_REF="${1#--live-backend-ref=}"; shift ;;
      --pinned-storefront-ref) PINNED_SF_REF="${2:?}"; shift 2 ;;
      --pinned-storefront-ref=*) PINNED_SF_REF="${1#--pinned-storefront-ref=}"; shift ;;
      --pinned-backend-ref) PINNED_BE_REF="${2:?}"; shift 2 ;;
      --pinned-backend-ref=*) PINNED_BE_REF="${1#--pinned-backend-ref=}"; shift ;;
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
# Harness overrides (same contract as the cutover helper): docker/compose
# binaries and the evidence dir are ordinary operator overrides; fault
# injection and probe shortcuts require WOODRIGHT_CUTOVER_HARNESS=1.
# ---------------------------------------------------------------------------
harness_enabled() { [[ "${WOODRIGHT_CUTOVER_HARNESS:-0}" == "1" ]]; }

wr_fault() {
  harness_enabled || return 1
  [[ "${WOODRIGHT_RECOVERY_FAULT:-}" == "$1" ]] || return 1
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
    return 0
  fi
  if [[ -r "$file" ]]; then
    HELPER_INSTALL_SHA="$(tr -d '[:space:]' <"$file" 2>/dev/null || true)"
    return 0
  fi
  HELPER_INSTALL_SHA=""
  log "NOTE helper_install_sha unresolved - recorded as empty, never substituted by application_source_sha"
}

# ---------------------------------------------------------------------------
# CLI + environment authority
# ---------------------------------------------------------------------------
FULL_ARGV=("$@")

# --help must work before the environment gate.
for wr_arg in "${FULL_ARGV[@]-}"; do
  case "$wr_arg" in
    -h|--help) usage; exit 0 ;;
  esac
done

wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
if [[ "${WOODRIGHT_ENVIRONMENT}" != "production" ]]; then
  die "refused --environment '${WOODRIGHT_ENVIRONMENT}' (only 'production' accepted here - this is the private production-candidate stack, never public_demo/staging)"
fi

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

case "$RECOVERY_MODE" in
  adopt-live-candidates|restore-pinned-runtime) ;;
  "") die "missing required --recovery-mode <adopt-live-candidates|restore-pinned-runtime>" ;;
  *) die "invalid --recovery-mode '$RECOVERY_MODE' (expected adopt-live-candidates|restore-pinned-runtime)" ;;
esac

if [[ "$MODE" == "execute" ]]; then
  wr_cutover_require_confirm_token "$EXECUTE_CONFIRM_TOKEN" "$CONFIRM" || exit 2
elif [[ -n "$CONFIRM" ]]; then
  die "--confirm-mutation is only valid with --mode execute"
fi

wr_cutover_require_full_sha "$SOURCE_SHA" || exit 2
resolve_helper_install_sha

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

IMAGE_REGISTRY="${WOODRIGHT_IMAGE_REGISTRY:-ghcr.io/saintgroovie}"
BE_TITLE="${WOODRIGHT_REQUIRED_BE_TITLE:-woodright-backend}"
SF_TITLE="${WOODRIGHT_REQUIRED_SF_TITLE:-woodright-storefront}"

require_immutable_ref() {
  local what="$1" ref="$2" title="$3"
  [[ -n "$ref" ]] || die "missing required --${what} (immutable ${IMAGE_REGISTRY%/}/${title}@sha256:<64hex>)"
  wr_cutover_require_digest "${ref##*@}" || exit 2
  wr_cutover_require_image_at_digest "$ref" "${ref##*@}" || exit 2
  local want="${IMAGE_REGISTRY%/}/${title}@"
  [[ "$ref" == "${want}"* ]] || die "refused --${what} '$ref' (expected ${want}sha256:<64hex> from the production profile)"
}
require_immutable_ref live-backend-ref "$LIVE_BE_REF" "$BE_TITLE"
require_immutable_ref live-storefront-ref "$LIVE_SF_REF" "$SF_TITLE"
require_immutable_ref pinned-backend-ref "$PINNED_BE_REF" "$BE_TITLE"
require_immutable_ref pinned-storefront-ref "$PINNED_SF_REF" "$SF_TITLE"
[[ "${LIVE_BE_REF##*@}" != "${LIVE_SF_REF##*@}" ]] || die "backend and storefront live digests must differ"
[[ "${PINNED_BE_REF##*@}" != "${PINNED_SF_REF##*@}" ]] || die "backend and storefront pinned digests must differ"

COMPOSE_ENV_FILE="${WOODRIGHT_CUTOVER_COMPOSE_ENV:-${WOODRIGHT_COMPOSE_ENV_FILE:-}}"
[[ -n "$COMPOSE_ENV_FILE" ]] || die "profile is missing WOODRIGHT_COMPOSE_ENV_FILE"
assert_not_public_demo_name "compose env file" "$COMPOSE_ENV_FILE"
assert_not_public_demo_name "ownership dir" "${WOODRIGHT_OWNERSHIP_DIR:-}"

host_port_of() {
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

BE_PORT="$(host_port_of "${WOODRIGHT_API_HOST}")"
SF_PORT="$(host_port_of "${WOODRIGHT_BUYER_HOST}")"
assert_loopback_host "api host" "${WOODRIGHT_API_HOST}"
assert_loopback_host "buyer host" "${WOODRIGHT_BUYER_HOST}"

# ---------------------------------------------------------------------------
# Shared read-only inspection (identical semantics to the cutover helper)
# ---------------------------------------------------------------------------
container_name_for() {
  case "$1" in
    backend) printf '%s\n' "${WOODRIGHT_BE_CONTAINER_DEFAULT}" ;;
    *) printf '%s\n' "${WOODRIGHT_SF_CONTAINER_DEFAULT}" ;;
  esac
}
image_title_for() {
  case "$1" in
    backend) printf '%s\n' "$BE_TITLE" ;;
    *) printf '%s\n' "$SF_TITLE" ;;
  esac
}
pin_key_for() {
  case "$1" in
    backend) printf '%s\n' "WOODRIGHT_BACKEND_IMAGE" ;;
    *) printf '%s\n' "WOODRIGHT_STOREFRONT_IMAGE" ;;
  esac
}
host_port_for() {
  case "$1" in
    backend) printf '%s\n' "$BE_PORT" ;;
    *) printf '%s\n' "$SF_PORT" ;;
  esac
}
target_ref_for() {
  # The ref this recovery converges on for the given component.
  if [[ "$RECOVERY_MODE" == "adopt-live-candidates" ]]; then
    case "$1" in backend) printf '%s\n' "$LIVE_BE_REF" ;; *) printf '%s\n' "$LIVE_SF_REF" ;; esac
  else
    case "$1" in backend) printf '%s\n' "$PINNED_BE_REF" ;; *) printf '%s\n' "$PINNED_SF_REF" ;; esac
  fi
}

container_id() { prod_docker inspect "$1" --format '{{.Id}}' 2>/dev/null || true; }
container_started_at() { prod_docker inspect "$1" --format '{{.State.StartedAt}}' 2>/dev/null || true; }

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

pin_value_of() {
  local key="$1"
  [[ -r "$COMPOSE_ENV_FILE" ]] || return 0
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$COMPOSE_ENV_FILE" 2>/dev/null || true
}

mismatch() {
  log "MISMATCH $*"
  MISMATCH=1
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
  [[ -n "$vol" ]] || { log "profile is missing WOODRIGHT_MEDIA_VOLUME"; return 1; }
  prod_docker volume inspect "$vol" >/dev/null 2>&1 || {
    log "required media volume missing: $vol"
    return 1
  }
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

# --- HTTP + readiness (same contract as the cutover helper) ------------------
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

ready_poll_interval() {
  if harness_enabled && [[ -n "${WOODRIGHT_CUTOVER_POLL_INTERVAL_SEC:-}" ]]; then
    printf '%s\n' "${WOODRIGHT_CUTOVER_POLL_INTERVAL_SEC}"
    return 0
  fi
  printf '%s\n' "$READY_POLL_INTERVAL_DEFAULT"
}

component_ready_deadline_sec() {
  local kind="$1"
  local fallback="$READY_DEADLINE_BE_DEFAULT"
  [[ "$kind" == "backend" ]] || fallback="$READY_DEADLINE_SF_DEFAULT"
  if harness_enabled && [[ -n "${WOODRIGHT_CUTOVER_READY_DEADLINE_SEC:-}" ]]; then
    printf '%s\n' "${WOODRIGHT_CUTOVER_READY_DEADLINE_SEC}"
    return 0
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

wait_component_ready() {
  local kind="$1" name="$2" deadline="$3"
  local url started now attempt=0 blob status health restarts fields=() line
  local docker_ready=0 healthcheck_present=1
  url="$(readiness_url_for "$kind")"
  started="$(date +%s)"
  poll_note "$kind" "begin container=$name deadline=${deadline}s url=$url"
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
    poll_note "$kind" "attempt=$attempt status=${status:-<empty>} health=${health:-<none>} restarts=${restarts:-<none>}"
    case "$status" in
      exited|dead|removing) log "readiness: $kind status=$status - terminal"; return 1 ;;
    esac
    if [[ "$restarts" =~ ^[0-9]+$ ]] && [[ "$restarts" -ge "$READY_RESTART_LOOP_THRESHOLD" ]]; then
      log "readiness: $kind restart loop detected (RestartCount=$restarts) - terminal"
      return 1
    fi
    case "$health" in
      healthy) docker_ready=1 ;;
      ""|"<no value>"|"<nil>") healthcheck_present=0; docker_ready=1 ;;
      *) docker_ready=0 ;;
    esac
    if [[ "$status" == "running" && "$docker_ready" == "1" ]]; then
      [[ "$healthcheck_present" == "1" ]] || log "readiness: $kind has no healthcheck - HTTP-only readiness"
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
    return 0
  fi
  local code
  while :; do
    attempt=$((attempt + 1))
    code="$(http_status "$url")"
    poll_note "$kind" "attempt=$attempt http=$url code=$code"
    [[ "$code" == "200" ]] && return 0
    now="$(date +%s)"
    if [[ $(( now - started )) -ge "$deadline" ]]; then
      log "readiness: $kind HTTP gate timed out after ${deadline}s (last code=$code url=$url)"
      return 1
    fi
    sleep "$(ready_poll_interval)"
  done
}

# ---------------------------------------------------------------------------
# Verification (identical in dry-run and execute; execute repeats it after the
# lock so a concurrent actor cannot slip a different runtime underneath).
# ---------------------------------------------------------------------------
WR_RUNTIME_BE_REF=""
WR_RUNTIME_SF_REF=""
WR_PIN_BE_VALUE=""
WR_PIN_SF_VALUE=""
WR_HEALTH_BE=""
WR_HEALTH_SF=""

verify_runtime_identity() {
  local kind name want got
  for kind in backend storefront; do
    name="$(container_name_for "$kind")"
    if ! prod_docker inspect "$name" >/dev/null 2>&1; then
      mismatch "$kind container '$name' is absent"
      continue
    fi
    got="$(resolve_live_ref "$name" "$(image_title_for "$kind")" "$kind")"
    if [[ "$kind" == "backend" ]]; then want="$LIVE_BE_REF"; WR_RUNTIME_BE_REF="$got"; else want="$LIVE_SF_REF"; WR_RUNTIME_SF_REF="$got"; fi
    if [[ -z "$got" ]]; then
      mismatch "$kind runtime RepoDigest could not be resolved"
    elif [[ "$got" != "$want" ]]; then
      mismatch "$kind runtime ref '$got' does not match --live-${kind}-ref '$want'"
    else
      log "runtime_ok $kind $got"
    fi
  done
}

verify_pins_are_pinned_refs() {
  local kind want got
  WR_PIN_BE_VALUE="$(pin_value_of WOODRIGHT_BACKEND_IMAGE)"
  WR_PIN_SF_VALUE="$(pin_value_of WOODRIGHT_STOREFRONT_IMAGE)"
  for kind in backend storefront; do
    if [[ "$kind" == "backend" ]]; then want="$PINNED_BE_REF"; got="$WR_PIN_BE_VALUE"; else want="$PINNED_SF_REF"; got="$WR_PIN_SF_VALUE"; fi
    if [[ -z "$got" ]]; then
      mismatch "$kind pin is absent from $COMPOSE_ENV_FILE"
    elif [[ "$got" != "$want" ]]; then
      mismatch "$kind pin '$got' does not match --pinned-${kind}-ref '$want'"
    else
      log "pin_ok $kind $got"
    fi
  done
}

# adopt-live-candidates only: the live images must be the intended release.
# Rollback images (restore-pinned-runtime) are deliberately NOT held to the
# production_candidate label - older images predate that build profile, and the
# operator-supplied digest is the authority there.
verify_live_image_provenance() {
  local kind ref revision profile
  for kind in backend storefront; do
    if [[ "$kind" == "backend" ]]; then ref="$LIVE_BE_REF"; else ref="$LIVE_SF_REF"; fi
    if ! prod_docker image inspect "$ref" >/dev/null 2>&1; then
      mismatch "$kind live image is not present locally: $ref"
      continue
    fi
    revision="$(prod_docker image inspect "$ref" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
    profile="$(prod_docker image inspect "$ref" --format '{{index .Config.Labels "woodright.image.build_profile"}}' 2>/dev/null || true)"
    if [[ "$revision" != "$SOURCE_SHA" ]]; then
      mismatch "$kind live image oci_revision='${revision:-<absent>}' expected='$SOURCE_SHA'"
    fi
    if [[ "$profile" != "$BUILD_PROFILE_EXPECTED" ]]; then
      mismatch "$kind live image build_profile='${profile:-<absent>}' expected='$BUILD_PROFILE_EXPECTED'"
    fi
  done
}

verify_pinned_images_present() {
  local kind ref
  for kind in backend storefront; do
    if [[ "$kind" == "backend" ]]; then ref="$PINNED_BE_REF"; else ref="$PINNED_SF_REF"; fi
    prod_docker image inspect "$ref" >/dev/null 2>&1 \
      || mismatch "$kind pinned image is not present locally: $ref (this helper never pulls)"
  done
}

verify_runtime_shape() {
  local kind name health
  for kind in backend storefront; do
    name="$(container_name_for "$kind")"
    prod_docker inspect "$name" >/dev/null 2>&1 || continue
    health="$(prod_docker inspect "$name" --format '{{.State.Status}}/{{.State.Health.Status}}' 2>/dev/null || true)"
    if [[ "$kind" == "backend" ]]; then WR_HEALTH_BE="$health"; else WR_HEALTH_SF="$health"; fi
    case "$health" in
      running/healthy|running/|"running/<no value>"|"running/<nil>") ;;
      *) mismatch "$kind is not running+healthy (state=$health)" ;;
    esac
    assert_private_binds "$name" "$(host_port_for "$kind")" >&2 || mismatch "$kind bind is not private"
    assert_no_public_traefik "$name" >&2 || mismatch "$kind carries public Traefik exposure"
    wr_assert_container_matches_environment "$name" "$kind" \
      || mismatch "$kind does not match the production profile (role/exposure/db alias/owner/compose project)"
  done
  assert_media_volume >&2 || mismatch "media volume gate failed"
}

verify_http_acceptance() {
  http_gate backend "${WOODRIGHT_API_HOST%/}/health" || mismatch "backend HTTP acceptance failed"
  http_gate storefront "${WOODRIGHT_BUYER_HOST%/}/" || mismatch "storefront HTTP acceptance failed"
}

run_verification() {
  verify_runtime_identity
  verify_pins_are_pinned_refs
  if [[ "$RECOVERY_MODE" == "adopt-live-candidates" ]]; then
    verify_live_image_provenance
    verify_runtime_shape
    verify_http_acceptance
  else
    verify_pinned_images_present
    assert_media_volume >&2 || mismatch "media volume gate failed"
  fi
}

# ---------------------------------------------------------------------------
# Packet
# ---------------------------------------------------------------------------
emit_packet() {
  local packet_mode="$1" verdict="$2"
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
  WR_PACKET_RECOVERY_MODE="$RECOVERY_MODE" \
  WR_PACKET_LIVE_BE="$LIVE_BE_REF" \
  WR_PACKET_LIVE_SF="$LIVE_SF_REF" \
  WR_PACKET_PINNED_BE="$PINNED_BE_REF" \
  WR_PACKET_PINNED_SF="$PINNED_SF_REF" \
  WR_PACKET_RUNTIME_BE="$WR_RUNTIME_BE_REF" \
  WR_PACKET_RUNTIME_SF="$WR_RUNTIME_SF_REF" \
  WR_PACKET_PIN_BE="$WR_PIN_BE_VALUE" \
  WR_PACKET_PIN_SF="$WR_PIN_SF_VALUE" \
  WR_PACKET_HEALTH_BE="$WR_HEALTH_BE" \
  WR_PACKET_HEALTH_SF="$WR_HEALTH_SF" \
  WR_PACKET_MISMATCH="$MISMATCH" \
  WR_PACKET_FREEZE_BE_STARTED="$FREEZE_BE_STARTED" \
  WR_PACKET_FREEZE_SF_STARTED="$FREEZE_SF_STARTED" \
  python3 - "$WOODRIGHT_ENVIRONMENT" "$WOODRIGHT_ENVIRONMENT_CLASS" "$SOURCE_SHA" "$packet_mode" \
    "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "${WOODRIGHT_SF_CONTAINER_DEFAULT}" \
    "${WOODRIGHT_MUTATION_LOCK_PATH:-}" <<'PY'
import json
import os
import sys

(
    environment,
    environment_class,
    source_sha,
    mode,
    be_container,
    sf_container,
    lock_path,
) = sys.argv[1:8]

recovery_mode = os.environ.get("WR_PACKET_RECOVERY_MODE", "")
adopt = recovery_mode == "adopt-live-candidates"
mismatch = os.environ.get("WR_PACKET_MISMATCH", "0") == "1"
buyer = os.environ.get("WR_PACKET_BUYER_HOST", "").rstrip("/")
api = os.environ.get("WR_PACKET_API_HOST", "").rstrip("/")

target = {
    "backend": os.environ.get("WR_PACKET_LIVE_BE" if adopt else "WR_PACKET_PINNED_BE", ""),
    "storefront": os.environ.get("WR_PACKET_LIVE_SF" if adopt else "WR_PACKET_PINNED_SF", ""),
}

packet = {
    "tool": "recover-production-candidate-skew.sh",
    "mode": mode,
    "recovery_mode": recovery_mode,
    "environment": environment,
    "environment_class": environment_class,
    "application_source_sha": source_sha,
    "helper_install_sha": os.environ.get("WR_PACKET_HELPER_SHA", ""),
    "sha_separation_note": (
        "application_source_sha is the OCI revision of the images; "
        "helper_install_sha is the ops commit that installed this script; "
        "they are recorded separately and never substituted for each other"
    ),
    "mutation_lock_path": lock_path,
    "verification_mismatch": mismatch,
    "declared": {
        "live": {
            "backend": os.environ.get("WR_PACKET_LIVE_BE", ""),
            "storefront": os.environ.get("WR_PACKET_LIVE_SF", ""),
        },
        "pinned": {
            "backend": os.environ.get("WR_PACKET_PINNED_BE", ""),
            "storefront": os.environ.get("WR_PACKET_PINNED_SF", ""),
        },
    },
    "observed": {
        "runtime": {
            "backend": os.environ.get("WR_PACKET_RUNTIME_BE", ""),
            "storefront": os.environ.get("WR_PACKET_RUNTIME_SF", ""),
        },
        "pins": {
            "backend": os.environ.get("WR_PACKET_PIN_BE", ""),
            "storefront": os.environ.get("WR_PACKET_PIN_SF", ""),
        },
        "state": {
            "backend": os.environ.get("WR_PACKET_HEALTH_BE", ""),
            "storefront": os.environ.get("WR_PACKET_HEALTH_SF", ""),
        },
    },
    "planned_mutation": {
        "converge_on": target,
        "pin_plan": {
            "compose_env_file": os.environ.get("WR_PACKET_COMPOSE_ENV", ""),
            "keys": {
                "WOODRIGHT_BACKEND_IMAGE": target["backend"],
                "WOODRIGHT_STOREFRONT_IMAGE": target["storefront"],
            },
            "atomic": "both keys rendered into one temp file, validated, then installed once",
        },
        "container_recreate_planned": not adopt,
        "StartedAt_expected_unchanged": adopt,
        "recreate": {
            "order": [] if adopt else ["backend", "storefront"],
            "compose_file": os.environ.get("WR_PACKET_COMPOSE_FILE", ""),
            "compose_project": os.environ.get("WR_PACKET_COMPOSE_PROJECT", ""),
            "flags": [] if adopt else ["up", "-d", "--no-deps", "--force-recreate"],
            "never_recreated": ["postgres", "redis"],
        },
        "ownership_targets": {
            "dir": os.environ.get("WR_PACKET_OWNERSHIP_DIR", ""),
            "files": ["ACTIVE_OWNER.json", "EXPECTED_RELEASE.json", "ACTIVE_RELEASE.json"],
            "release_sha_field": "application_source_sha",
        },
        "http_acceptance": [f"{api}/health", f"{buyer}/"],
        "state_machine": [
            "prepared",
            "pins_written",
            "metadata_written",
            "recovery_committed|recovery_incomplete|failed_before_mutation",
        ],
        "exit_codes": {
            "0": "ok",
            "2": "usage/validation",
            "3": "lock",
            "4": "dry-run verification mismatch",
            "14": "recovery_incomplete",
            "15": "recovery_runtime_restore_failed",
        },
        "no_pin_rollback_after_write": adopt,
    },
    "containers": {"backend": be_container, "storefront": sf_container},
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
            "verdict": os.environ.get("WR_PACKET_VERDICT", ""),
            "evidence_dir": os.environ.get("WR_PACKET_EVIDENCE_DIR", ""),
            "started_at_unchanged": {
                "backend": os.environ.get("WR_PACKET_FREEZE_BE_STARTED", ""),
                "storefront": os.environ.get("WR_PACKET_FREEZE_SF_STARTED", ""),
            },
            "no_mutation_performed": False,
            "no_lock_held": False,
            "no_pin_writes": False,
        }
    )

print(json.dumps(packet, indent=2, sort_keys=True))
PY
}

# ---------------------------------------------------------------------------
# Dry-run
# ---------------------------------------------------------------------------
if [[ "$MODE" == "dry-run" ]]; then
  run_verification
  emit_packet dry-run planned
  if [[ "$MISMATCH" -eq 1 ]]; then
    log "DRY_RUN_MISMATCH recovery_mode=$RECOVERY_MODE - refusing to describe this as a safe recovery (see MISMATCH lines above)"
    exit 4
  fi
  log "DRY_RUN_OK recovery_mode=$RECOVERY_MODE application_source_sha=$SOURCE_SHA (read-only; no lock held, no pins written, no containers touched)"
  exit 0
fi

# ===========================================================================
# EXECUTE
# ===========================================================================
[[ -f "$COMPOSE_ENV_FILE" ]] || die "compose env file missing: $COMPOSE_ENV_FILE"
[[ -n "${WOODRIGHT_COMPOSE_FILE:-}" && -f "${WOODRIGHT_COMPOSE_FILE}" ]] \
  || die "compose file missing: ${WOODRIGHT_COMPOSE_FILE:-<unset>}"
[[ -n "${WOODRIGHT_COMPOSE_PROJECT:-}" ]] || die "profile is missing WOODRIGHT_COMPOSE_PROJECT"

if [[ "${WOODRIGHT_PENDING_MIGRATION:-0}" == "1" ]]; then
  die "pending migration flagged (WOODRIGHT_PENDING_MIGRATION=1) - this helper is image/metadata-only and never migrates"
fi

run_verification
[[ "$MISMATCH" -eq 0 ]] || die "verification mismatch - refusing execute (see MISMATCH lines above)"

record_state() {
  PHASE="$1"
  [[ -n "$EVIDENCE_DIR" && -d "$EVIDENCE_DIR" ]] || return 0
  printf '%s\n' "$PHASE" >"$EVIDENCE_DIR/state.txt"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PHASE" >>"$EVIDENCE_DIR/state-transitions.log"
  log "STATE $PHASE"
}

release_lock() { wr_staging_mutation_lock_release || true; }

# True iff the live compose pin file already carries the recovery target pair.
# Diagnostic only - EXIT recovery uses PINS_INSTALLED (set in the statement
# immediately after a successful prod_atomic_install) as the authority, because
# restore-pinned-runtime starts with pins already equal to targets.
pins_file_matches_recovery_targets() {
  local be_pin sf_pin
  be_pin="$(awk -F= '$1=="WOODRIGHT_BACKEND_IMAGE" {sub(/^[^=]*=/,""); print; exit}' "$COMPOSE_ENV_FILE" 2>/dev/null || true)"
  sf_pin="$(awk -F= '$1=="WOODRIGHT_STOREFRONT_IMAGE" {sub(/^[^=]*=/,""); print; exit}' "$COMPOSE_ENV_FILE" 2>/dev/null || true)"
  [[ -n "$be_pin" && -n "$sf_pin" ]] || return 1
  [[ "$be_pin" == "$(target_ref_for backend)" && "$sf_pin" == "$(target_ref_for storefront)" ]]
}

recovery_on_exit() {
  local rc=$?
  trap - EXIT INT TERM HUP
  if [[ "$COMMITTED" == "1" || "$FINAL_STATE_RECORDED" == "1" ]]; then
    release_lock
    exit "$rc"
  fi
  if [[ "$PINS_INSTALLED" == "1" ]]; then
    # Deliberate: the stale pins are NOT restored. Putting them back would
    # recreate the very skew this helper removes, and would leave the runtime
    # unrepresented again. Report exactly what is and is not done.
    record_state recovery_incomplete
    log "RECOVERY_INCOMPLETE pins_installed=1 metadata_installed=$METADATA_INSTALLED - pins now describe the runtime; finish the ownership metadata by re-running this helper (stale pins were deliberately NOT restored)"
    [[ "$rc" -ge 14 ]] || rc=14
  else
    record_state failed_before_mutation
  fi
  release_lock
  exit "$rc"
}

recovery_on_signal() {
  local sig="$1" rc="$2"
  log "SIGNAL $sig received phase=$PHASE - fail-safe path engaged"
  exit "$rc"
}

# --- lock -------------------------------------------------------------------
if [[ "${WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL:-0}" == "1" ]]; then
  case "$WR_STAGING_MUTATION_LOCK_PATH" in
    */locks/production/live-cutover.lock) ;;
    *) die "refused lock path '$WR_STAGING_MUTATION_LOCK_PATH' (harness must still end in /locks/production/live-cutover.lock)" ;;
  esac
else
  [[ "$WR_STAGING_MUTATION_LOCK_PATH" == "$CANONICAL_LOCK_PATH" ]] \
    || die "refused lock path '$WR_STAGING_MUTATION_LOCK_PATH' (production recovery locks only $CANONICAL_LOCK_PATH)"
fi

WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_PATH}.meta"

WOODRIGHT_TARGET_SHA="$SOURCE_SHA" \
wr_staging_mutation_lock_acquire \
  "actor=recover-production-candidate-skew" \
  "command=$0 --environment production --recovery-mode $RECOVERY_MODE --mode execute" \
  "target=application_source_sha=${SOURCE_SHA} helper_install_sha=${HELPER_INSTALL_SHA:-none}" \
  || exit 3

trap 'recovery_on_exit' EXIT
trap 'recovery_on_signal INT 130' INT
trap 'recovery_on_signal TERM 143' TERM
trap 'recovery_on_signal HUP 129' HUP

log "lock held path=$WR_STAGING_MUTATION_LOCK_PATH"

# --- under-lock re-verification + freeze ------------------------------------
wr_prelock_validate_environment_target || die "under-lock environment retarget detected"
MISMATCH=0
run_verification
[[ "$MISMATCH" -eq 0 ]] || die "under-lock verification mismatch - refusing to mutate"

FREEZE_BE_ID="$(container_id "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
FREEZE_SF_ID="$(container_id "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
FREEZE_BE_STARTED="$(container_started_at "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
FREEZE_SF_STARTED="$(container_started_at "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
FREEZE_BE_REF="$(resolve_live_ref "${WOODRIGHT_BE_CONTAINER_DEFAULT}" "$BE_TITLE" backend)"
FREEZE_SF_REF="$(resolve_live_ref "${WOODRIGHT_SF_CONTAINER_DEFAULT}" "$SF_TITLE" storefront)"
FREEZE_PIN_SHA="$(sha256_of "$COMPOSE_ENV_FILE")"
log "freeze backend id=$FREEZE_BE_ID started_at=$FREEZE_BE_STARTED ref=$FREEZE_BE_REF"
log "freeze storefront id=$FREEZE_SF_ID started_at=$FREEZE_SF_STARTED ref=$FREEZE_SF_REF"

# --- evidence ---------------------------------------------------------------
if [[ -n "${WOODRIGHT_EVIDENCE_DIR:-}" ]]; then
  EVIDENCE_DIR="${WOODRIGHT_EVIDENCE_DIR}"
else
  [[ -n "${WOODRIGHT_EVIDENCE_ROOT:-}" ]] || die "profile is missing WOODRIGHT_EVIDENCE_ROOT"
  EVIDENCE_DIR="${WOODRIGHT_EVIDENCE_ROOT%/}/pin-runtime-skew-recovery-${TS_RUN}"
fi
assert_not_public_demo_name "evidence dir" "$EVIDENCE_DIR"
wr_cutover_evidence_init "$EVIDENCE_DIR" "production-candidate-skew-recovery" || die "evidence init failed: $EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR/pin-backup" "$EVIDENCE_DIR/json/ownership-staging"
printf '%s\n' "$SOURCE_SHA" >"$EVIDENCE_DIR/json/application-source-sha.txt"
printf '%s\n' "${HELPER_INSTALL_SHA}" >"$EVIDENCE_DIR/json/helper-install-sha.txt"
printf '%s\n' "$RECOVERY_MODE" >"$EVIDENCE_DIR/json/recovery-mode.txt"
printf '{"backend_id":"%s","storefront_id":"%s","backend_started_at":"%s","storefront_started_at":"%s","backend_ref":"%s","storefront_ref":"%s","pin_file_sha256":"%s"}\n' \
  "$FREEZE_BE_ID" "$FREEZE_SF_ID" "$FREEZE_BE_STARTED" "$FREEZE_SF_STARTED" \
  "$FREEZE_BE_REF" "$FREEZE_SF_REF" "$FREEZE_PIN_SHA" >"$EVIDENCE_DIR/json/freeze.json"
prod_docker inspect "${WOODRIGHT_BE_CONTAINER_DEFAULT}" | wr_cutover_sanitize_inspect_json \
  >"$EVIDENCE_DIR/sanitized/backend-before.json" || true
prod_docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT}" | wr_cutover_sanitize_inspect_json \
  >"$EVIDENCE_DIR/sanitized/storefront-before.json" || true
wr_cutover_assert_no_secret_leak "$EVIDENCE_DIR/sanitized/backend-before.json" || die "secret-like material in backend evidence"
wr_cutover_assert_no_secret_leak "$EVIDENCE_DIR/sanitized/storefront-before.json" || die "secret-like material in storefront evidence"

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
for own in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
  backup_file "${WOODRIGHT_OWNERSHIP_DIR%/}/$own" "$own" || die "ownership backup failed: $own"
done
record_state prepared

test_pause_at() {
  harness_enabled || return 0
  [[ "${WOODRIGHT_RECOVERY_TEST_PAUSE_AT:-}" == "$1" ]] || return 0
  local budget="${WOODRIGHT_RECOVERY_TEST_PAUSE_SEC:-10}" waited=0
  log "HARNESS pause at $1 for up to ${budget}s"
  while (( waited < budget * 5 )); do
    sleep 0.2
    waited=$((waited + 1))
  done
}
test_pause_at prepared

# --- atomic install helpers (same model as the cutover helper) --------------
prod_atomic_install() {
  local src="${1:?}" dest="${2:?}"
  local dir published
  [[ -f "$src" ]] || return 1
  dir="$(dirname "$dest")"
  published="${dest}.wr-recovery-new-$$"
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
  local path="$1" be="$2" sf="$3"
  python3 - "$path" "$be" "$sf" <<'PY'
import sys
path, be, sf = sys.argv[1:4]
lines = open(path, "r", encoding="utf-8").read().splitlines()
for key, value in (("WOODRIGHT_BACKEND_IMAGE", be), ("WOODRIGHT_STOREFRONT_IMAGE", sf)):
    hits = [l for l in lines if l.startswith(f"{key}=")]
    if len(hits) != 1 or hits[0] != f"{key}={value}":
        print(f"PIN_VALIDATION_FAILED {key} -> {hits}")
        sys.exit(1)
print("pin_file_ok")
PY
}

# Single atomic pair install: both image keys rendered into one temp file,
# validated as a whole, then published once. No mixed-pin window.
write_pair_pins_atomic() {
  local be_want sf_want tmp
  be_want="$(target_ref_for backend)"
  sf_want="$(target_ref_for storefront)"
  tmp="$(mktemp "$(dirname "$COMPOSE_ENV_FILE")/.wr-recovery-pin-XXXXXX" 2>/dev/null || true)"
  if [[ -z "$tmp" ]]; then
    log "NOTE pin tmp falls back to the evidence dir (compose dir not writable by this user)"
    tmp="$(mktemp "$EVIDENCE_DIR/pin-backup/.wr-recovery-pin-XXXXXX")"
  fi
  cp -p "$COMPOSE_ENV_FILE" "$tmp" || { rm -f "$tmp"; return 1; }
  render_pin "$tmp" "${tmp}.be" WOODRIGHT_BACKEND_IMAGE "$be_want" || { rm -f "$tmp" "${tmp}.be"; return 1; }
  mv -f "${tmp}.be" "$tmp" || { rm -f "$tmp" "${tmp}.be"; return 1; }
  render_pin "$tmp" "${tmp}.sf" WOODRIGHT_STOREFRONT_IMAGE "$sf_want" || { rm -f "$tmp" "${tmp}.sf"; return 1; }
  mv -f "${tmp}.sf" "$tmp" || { rm -f "$tmp" "${tmp}.sf"; return 1; }
  validate_pin_file "$tmp" "$be_want" "$sf_want" >&2 || { rm -f "$tmp"; return 1; }
  # Phase marks "about to publish". PINS_INSTALLED flips in the next statement
  # after a successful install (no statements between install and the flag).
  record_state pins_written
  # Fault after arming, before publication: proves failed_before_mutation when
  # the pin file is still the pre-mutation pair (fidelity: pin_write).
  if wr_fault pin_write; then
    rm -f "$tmp"
    return 1
  fi
  if ! prod_atomic_install "$tmp" "$COMPOSE_ENV_FILE"; then
    rm -f "$tmp"
    return 1
  fi
  PINS_INSTALLED=1
  # Fault after the published flag is set: proves recovery_incomplete
  # (fidelity: pin_install_after_publish).
  if wr_fault pin_install_after_publish; then
    rm -f "$tmp"
    return 1
  fi
  rm -f "$tmp"
  printf '%s WOODRIGHT_BACKEND_IMAGE=%s\n%s WOODRIGHT_STOREFRONT_IMAGE=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$be_want" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sf_want" \
    >>"$EVIDENCE_DIR/json/pins-written.txt"
  log "PIN_WRITTEN_ATOMIC backend=$be_want storefront=$sf_want"
  return 0
}

# --- ownership metadata -----------------------------------------------------
# Schema follows write_ownership_metadata in
# ops/release/cutover-production-candidate.sh exactly: the same three files,
# the same schema strings, the same application_source_sha / helper_install_sha
# separation, plus a recovery_mode marker on ACTIVE_RELEASE.
write_ownership_metadata() {
  local dir="${WOODRIGHT_OWNERSHIP_DIR%/}"
  [[ -n "$dir" ]] || { log "ownership dir unset"; return 1; }
  local f
  for f in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
    wr_assert_manifest_path_for_environment "$dir/$f" || return 1
  done
  mkdir -p "$dir" 2>/dev/null || sudo -n mkdir -p "$dir" 2>/dev/null || true
  [[ -d "$dir" ]] || { log "ownership dir missing: $dir"; return 1; }

  if wr_fault metadata_write; then
    return 1
  fi

  WR_META_DIR="$dir" \
  WR_META_ENV="$WOODRIGHT_ENVIRONMENT" \
  WR_META_CLASS="$WOODRIGHT_ENVIRONMENT_CLASS" \
  WR_META_APP_SHA="$SOURCE_SHA" \
  WR_META_HELPER_SHA="$HELPER_INSTALL_SHA" \
  WR_META_BE_REF="$(target_ref_for backend)" \
  WR_META_SF_REF="$(target_ref_for storefront)" \
  WR_META_BE_CONTAINER="${WOODRIGHT_BE_CONTAINER_DEFAULT}" \
  WR_META_SF_CONTAINER="${WOODRIGHT_SF_CONTAINER_DEFAULT}" \
  WR_META_PROJECT="${WOODRIGHT_COMPOSE_PROJECT}" \
  WR_META_OWNER="${WOODRIGHT_REQUIRED_OWNER_LABEL:-Dokploy}" \
  WR_META_EVIDENCE="$EVIDENCE_DIR" \
  WR_META_RECOVERY_MODE="$RECOVERY_MODE" \
  WR_META_STAGING="$EVIDENCE_DIR/json/ownership-staging" \
  python3 <<'PY' || return 1
import json, os, datetime

staging = os.environ["WR_META_STAGING"]
os.makedirs(staging, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
app_sha = os.environ["WR_META_APP_SHA"]
helper_sha = os.environ.get("WR_META_HELPER_SHA", "")
be_ref = os.environ.get("WR_META_BE_REF", "")
sf_ref = os.environ.get("WR_META_SF_REF", "")

common = {
    "environment": os.environ["WR_META_ENV"],
    "environment_class": os.environ["WR_META_CLASS"],
    "component": "pair",
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
        recovery_mode=os.environ["WR_META_RECOVERY_MODE"],
    ),
}

for name, doc in docs.items():
    path = os.path.join(staging, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2, sort_keys=True)
        fh.write("\n")
    os.chmod(path, 0o600)
PY

  if wr_fault metadata_install; then
    log "HARNESS fault metadata_install after staging, before live install"
    return 1
  fi

  local name staged_src dest
  for name in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
    staged_src="$EVIDENCE_DIR/json/ownership-staging/$name"
    dest="$dir/$name"
    [[ -f "$staged_src" ]] || { log "staged ownership missing: $name"; return 1; }
    prod_atomic_install "$staged_src" "$dest" || { log "ownership install failed for $name"; return 1; }
    chmod 0600 "$dest" 2>/dev/null || sudo -n chmod 0600 "$dest" 2>/dev/null || true
  done
  METADATA_INSTALLED=1
  log "ownership metadata written under $dir (application_source_sha=$SOURCE_SHA helper_install_sha=${HELPER_INSTALL_SHA:-<empty>})"
  return 0
}

# --- restore-pinned-runtime recreate ----------------------------------------
compose_up() {
  local service="$1"
  shift
  prod_compose -f "${WOODRIGHT_COMPOSE_FILE}" --env-file "$COMPOSE_ENV_FILE" \
    --project-name "${WOODRIGHT_COMPOSE_PROJECT}" up -d --no-deps "$@" "$service"
}

recreate_onto_pins() {
  local kind name want deadline up_rc=0 got
  for kind in backend storefront; do
    name="$(container_name_for "$kind")"
    want="$(target_ref_for "$kind")"
    if [[ "$(resolve_live_ref "$name" "$(image_title_for "$kind")" "$kind")" == "$want" ]]; then
      log "$kind already on $want - no recreate needed"
    else
      up_rc=0
      compose_up "$kind" --force-recreate >&2 || up_rc=$?
      if wr_fault "${kind}_recreate"; then up_rc=1; fi
      if [[ "$up_rc" -ne 0 ]]; then
        log "$kind recreate onto $want failed rc=$up_rc"
        return 1
      fi
      got="$(resolve_live_ref "$name" "$(image_title_for "$kind")" "$kind")"
      if [[ "$got" != "$want" ]]; then
        log "$kind runtime is $got after recreate, expected $want"
        return 1
      fi
      log "$kind recreated onto $want"
    fi
    deadline="$(component_ready_deadline_sec "$kind")"
    wait_component_ready "$kind" "$name" "$deadline" || {
      log "$kind did not become ready after recreate"
      return 1
    }
  done
  return 0
}

# --- final convergence proof -------------------------------------------------
verify_convergence() {
  local rc=0 kind name want pin runtime
  for kind in backend storefront; do
    name="$(container_name_for "$kind")"
    want="$(target_ref_for "$kind")"
    pin="$(pin_value_of "$(pin_key_for "$kind")")"
    runtime="$(resolve_live_ref "$name" "$(image_title_for "$kind")" "$kind")"
    if [[ "$pin" != "$want" ]]; then
      log "CONVERGE_FAIL $kind pin='$pin' expected='$want'"
      rc=1
    fi
    if [[ "$runtime" != "$want" ]]; then
      log "CONVERGE_FAIL $kind runtime='$runtime' expected='$want'"
      rc=1
    fi
    if [[ "$rc" -eq 0 ]]; then
      log "converged $kind pin==runtime==$want"
    fi
  done
  return "$rc"
}

verify_active_metadata_matches() {
  local dir="${WOODRIGHT_OWNERSHIP_DIR%/}"
  WR_CHECK_BE="$(target_ref_for backend)" WR_CHECK_SF="$(target_ref_for storefront)" \
  WR_CHECK_SHA="$SOURCE_SHA" python3 - "$dir" <<'PY'
import json, os, sys
d = sys.argv[1]
want_be = os.environ["WR_CHECK_BE"]
want_sf = os.environ["WR_CHECK_SF"]
want_sha = os.environ["WR_CHECK_SHA"]
for name in ("ACTIVE_OWNER.json", "EXPECTED_RELEASE.json", "ACTIVE_RELEASE.json"):
    path = os.path.join(d, name)
    if not os.path.isfile(path):
        print(f"ACTIVE_METADATA_MISSING {name}")
        sys.exit(1)
    doc = json.load(open(path, encoding="utf-8"))
    if doc.get("application_source_sha") != want_sha:
        print(f"ACTIVE_METADATA_SHA_MISMATCH {name} {doc.get('application_source_sha')}")
        sys.exit(1)
for name, be_key, sf_key in (
    ("EXPECTED_RELEASE.json", "backend_image", "storefront_image"),
    ("ACTIVE_RELEASE.json", "backend_image", "storefront_image"),
):
    doc = json.load(open(os.path.join(d, name), encoding="utf-8"))
    if doc.get(be_key) != want_be or doc.get(sf_key) != want_sf:
        print(f"ACTIVE_METADATA_DIGEST_MISMATCH {name}")
        sys.exit(1)
print("active_metadata_ok")
PY
}

verify_started_at_unchanged() {
  local now_be now_sf rc=0
  now_be="$(container_started_at "${WOODRIGHT_BE_CONTAINER_DEFAULT}")"
  now_sf="$(container_started_at "${WOODRIGHT_SF_CONTAINER_DEFAULT}")"
  if [[ "$now_be" != "$FREEZE_BE_STARTED" ]]; then
    log "STARTED_AT_CHANGED backend before='$FREEZE_BE_STARTED' after='$now_be' (adopt mode must not restart containers)"
    rc=1
  fi
  if [[ "$now_sf" != "$FREEZE_SF_STARTED" ]]; then
    log "STARTED_AT_CHANGED storefront before='$FREEZE_SF_STARTED' after='$now_sf' (adopt mode must not restart containers)"
    rc=1
  fi
  return "$rc"
}

# --- mutation ----------------------------------------------------------------
if [[ "$RECOVERY_MODE" == "restore-pinned-runtime" ]]; then
  # Pins first so the compose recreate reads the pinned refs from the same file
  # the runtime will be verified against.
  if ! write_pair_pins_atomic; then
    die "atomic pin write failed - no container was recreated"
  fi
  test_pause_at pins_written
  if ! recreate_onto_pins; then
    record_state recovery_incomplete
    FINAL_STATE_RECORDED=1
    log "RECOVERY_RUNTIME_RESTORE_FAILED pins are at the pinned refs but the runtime is not - do NOT treat this as recovered"
    exit 15
  fi
else
  if ! write_pair_pins_atomic; then
    die "atomic pin write failed - nothing was mutated"
  fi
  test_pause_at pins_written
fi

if ! write_ownership_metadata; then
  # Exit trap reports recovery_incomplete (14). Stale pins stay REMOVED on
  # purpose: the runtime is now correctly described by the pin file.
  log "ownership metadata write failed after the pin write"
  exit 14
fi
record_state metadata_written

if ! verify_convergence; then
  log "post-write convergence check failed"
  exit 14
fi
if ! verify_active_metadata_matches >&2; then
  log "ownership metadata does not describe the converged pair"
  exit 14
fi
if [[ "$RECOVERY_MODE" == "adopt-live-candidates" ]]; then
  if ! verify_started_at_unchanged; then
    log "adopt-live-candidates must not restart containers"
    exit 14
  fi
  if [[ "$(container_id "${WOODRIGHT_BE_CONTAINER_DEFAULT}")" != "$FREEZE_BE_ID" \
     || "$(container_id "${WOODRIGHT_SF_CONTAINER_DEFAULT}")" != "$FREEZE_SF_ID" ]]; then
    log "container id changed during adopt-live-candidates"
    exit 14
  fi
fi
http_gate post-recovery-backend "${WOODRIGHT_API_HOST%/}/health" || { log "post-recovery backend HTTP gate failed"; exit 14; }
http_gate post-recovery-storefront "${WOODRIGHT_BUYER_HOST%/}/" || { log "post-recovery storefront HTTP gate failed"; exit 14; }

COMMITTED=1
record_state recovery_committed
{
  echo "# Production-candidate pin/runtime skew recovery"
  echo "- recovery_mode: $RECOVERY_MODE"
  echo "- application_source_sha: $SOURCE_SHA"
  echo "- helper_install_sha: ${HELPER_INSTALL_SHA:-<empty>}"
  echo "- backend: $(target_ref_for backend)"
  echo "- storefront: $(target_ref_for storefront)"
  echo "- containers recreated: $([[ "$RECOVERY_MODE" == "adopt-live-candidates" ]] && echo none || echo 'backend,storefront')"
  echo "- lock: $WR_STAGING_MUTATION_LOCK_PATH"
} >"$EVIDENCE_DIR/SUMMARY.md"

emit_packet execute recovery_committed >"$EVIDENCE_DIR/json/final-packet.json"
cat "$EVIDENCE_DIR/json/final-packet.json"
log "PRODUCTION_CANDIDATE_SKEW_RECOVERY_OK recovery_mode=$RECOVERY_MODE application_source_sha=$SOURCE_SHA"
exit 0
