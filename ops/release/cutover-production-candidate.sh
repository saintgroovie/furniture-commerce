#!/usr/bin/env bash
# LIVE_MUTATING=false (dry-run only in this release; execute is a fail-closed stub)
# requires_global_lock=false
#
# Read-only dry-run helper for cutting the PRIVATE production-candidate stack
# over to specific image digests/SHA. Execute mode is intentionally NOT wired
# to any recreate path yet - it validates its own gate and then fails closed.
#
# NOT a public woodright.ru cutover, NOT a DNS/Traefik/CDN change, and NOT the
# public_demo pair cutover. The only accepted --environment is "production"
# (the private production-candidate stack: ops/config/runtime-environments/
# production.conf, class PRODUCTION_CANDIDATE, WOODRIGHT_PUBLIC_EXPOSURE=
# private). --environment public_demo is explicitly refused here - use
# ops/release/cutover-public-demo-pair.sh (which this script does not modify
# or weaken) for the buyer-facing demo.
#
# Usage:
#   ops/release/cutover-production-candidate.sh \
#     --environment production \
#     --component storefront|backend|pair \
#     --source-sha <40hex> \
#     [--storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:<64hex>] \
#     [--backend-ref ghcr.io/saintgroovie/woodright-backend@sha256:<64hex>] \
#     [--mode dry-run|execute]                  # default dry-run
#     [--confirm-mutation <token>]               # execute only; still fails closed
#
# Dry-run (default): read-only.
#   - loads ops/config/runtime-environments/production.conf via
#     ops/lib/woodright-environment-profile.sh
#   - verifies expected container names / binds / lock path from that profile
#   - inspects current containers with `docker inspect` only (never pulls,
#     never recreates)
#   - if a candidate ref is present locally, verifies its
#     org.opencontainers.image.revision == --source-sha and its
#     woodright.image.build_profile == production_candidate label
#   - prints one non-secret JSON packet to stdout and exits 0
#   - holds no lock beyond a brief non-blocking flock probe, writes no pins,
#     writes no ACTIVE_OWNER/EXPECTED_RELEASE files, recreates nothing
#
# Execute: requires --confirm-mutation I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER,
# then still fails closed - the production mutate path (flock + recreate +
# rollback, mirroring cutover-public-demo-pair.sh) is a separate, explicitly
# approved follow-up and is intentionally not implemented in this release.
#
# Exit codes:
#   0 dry-run ok | 2 usage/validation error | 3 execute not enabled in this
#   release | 4 dry-run detected a candidate/target mismatch
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

EXECUTE_CONFIRM_TOKEN="I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER"

MODE="dry-run"
SOURCE_SHA=""
SF_REF=""
BE_REF=""
CONFIRM=""
MISMATCH=0


# All diagnostic/status lines go to stderr; stdout is reserved for the single
# machine-readable JSON packet at the end of a successful dry-run.
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 2; }

usage() {
  cat <<'EOF'
Usage: cutover-production-candidate.sh --environment production --component <storefront|backend|pair> --source-sha <40hex> [options]

Required:
  --environment production        (only "production" accepted; public_demo/staging refused)
  --component storefront|backend|pair
  --source-sha <40hex>
  --storefront-ref ghcr.io/...@sha256:<64hex>   (required for storefront|pair)
  --backend-ref ghcr.io/...@sha256:<64hex>      (required for backend|pair)

Optional:
  --mode dry-run|execute      (default dry-run)
  --confirm-mutation <token>  (execute only; execute currently fails closed regardless)

Dry-run: read-only. No lock held, no pin writes, no recreate, no ACTIVE/EXPECTED writes.
Execute: fails closed in this release - the production mutate path requires a
         separate, explicitly approved follow-up.
EOF
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
      --mode) MODE="${2:?}"; shift 2 ;;
      --mode=*) MODE="${1#--mode=}"; shift ;;
      --dry-run) MODE="dry-run"; shift ;;
      --execute) MODE="execute"; shift ;;
      --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
      --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
      *) die "unknown argument: $1" ;;
    esac
  done
}

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

case "$MODE" in
  dry-run|execute) ;;
  *) die "invalid --mode '$MODE' (expected dry-run|execute)" ;;
esac
wr_cutover_require_full_sha "$SOURCE_SHA" || exit 2

# Belt-and-braces: this helper must never be pointed at a public_demo/staging
# -named container even if a profile/env var were ever mixed up upstream.
# (wr_cutover_refuse_production_name from woodright-cutover-common.sh is for
# the OPPOSITE direction - public_demo scripts refusing production names -
# and does not apply here, since this helper's whole purpose IS production.)
case "${WOODRIGHT_BE_CONTAINER_DEFAULT}" in
  *staging*|*public-demo*|*public_demo*) die "refused non-production container name for backend: ${WOODRIGHT_BE_CONTAINER_DEFAULT}" ;;
esac
case "${WOODRIGHT_SF_CONTAINER_DEFAULT}" in
  *staging*|*public-demo*|*public_demo*) die "refused non-production container name for storefront: ${WOODRIGHT_SF_CONTAINER_DEFAULT}" ;;
esac

wr_assert_environment_provisioned || exit 1
wr_prelock_validate_environment_target || exit 1

need_sf() { [[ "$COMPONENT" == "storefront" || "$COMPONENT" == "pair" ]]; }
need_be() { [[ "$COMPONENT" == "backend" || "$COMPONENT" == "pair" ]]; }

if need_sf; then
  [[ -n "$SF_REF" ]] || die "--storefront-ref required for --component $COMPONENT"
  wr_cutover_require_digest "${SF_REF##*@}" || exit 2
  wr_cutover_require_image_at_digest "$SF_REF" "${SF_REF##*@}" || exit 2
fi
if need_be; then
  [[ -n "$BE_REF" ]] || die "--backend-ref required for --component $COMPONENT"
  wr_cutover_require_digest "${BE_REF##*@}" || exit 2
  wr_cutover_require_image_at_digest "$BE_REF" "${BE_REF##*@}" || exit 2
fi

# ---------------------------------------------------------------------------
# Execute mode: validate its own gate, then fail closed (stub for this release).
# ---------------------------------------------------------------------------
if [[ "$MODE" == "execute" ]]; then
  if [[ "$CONFIRM" != "$EXECUTE_CONFIRM_TOKEN" ]]; then
    die "execute requires --confirm-mutation ${EXECUTE_CONFIRM_TOKEN}"
  fi
  log "execute mode not enabled in this release - dry-run only"
  log "the production mutate path (flock + recreate + rollback) requires a separate, explicitly approved follow-up"
  exit 3
fi

# ---------------------------------------------------------------------------
# Dry-run: read-only inspection only, from here on.
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
  if wr_cutover_docker image inspect "$ref" >/dev/null 2>&1; then
    present="true"
    revision="$(wr_oci_image_revision "$ref")"
    profile_label="$(wr_cutover_docker image inspect "$ref" --format '{{index .Config.Labels "woodright.image.build_profile"}}' 2>/dev/null || true)"
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
    elif [[ "$profile_label" != "production_candidate" ]]; then
      log "MISMATCH $kind ref=$ref build_profile=$profile_label expected=production_candidate"
      MISMATCH=1
    fi
  else
    log "NOTE $kind image not present locally (dry-run never pulls) - not verified: $ref"
  fi
  eval "WR_${kind}_PRESENT=\"$present\""
  eval "WR_${kind}_REVISION=\"$revision\""
  eval "WR_${kind}_BUILD_PROFILE=\"$profile_label\""
  eval "WR_${kind}_REF=\"$ref\""
}

# Read-only container inspection - never mutates.
inspect_container() {
  local kind="$1" name="$2"
  if ! wr_cutover_docker inspect "$name" >/dev/null 2>&1; then
    eval "WR_${kind}_CONTAINER_PRESENT=false"
    log "NOTE $kind container '$name' not found locally (read-only inspect; nothing mutated)"
    return 0
  fi
  eval "WR_${kind}_CONTAINER_PRESENT=true"
  eval "WR_${kind}_CONTAINER_ID=\"$(wr_cutover_docker inspect "$name" --format '{{.Id}}' 2>/dev/null || true)\""
  eval "WR_${kind}_CONTAINER_IMAGE=\"$(wr_cutover_docker inspect "$name" --format '{{.Config.Image}}' 2>/dev/null || true)\""
  eval "WR_${kind}_CONTAINER_RESTARTS=\"$(wr_cutover_docker inspect "$name" --format '{{.RestartCount}}' 2>/dev/null || true)\""
  eval "WR_${kind}_CONTAINER_ROLE_LABEL=\"$(wr_cutover_docker inspect "$name" --format '{{index .Config.Labels "com.woodright.runtime-role"}}' 2>/dev/null || true)\""
  eval "WR_${kind}_CONTAINER_OWNER_LABEL=\"$(wr_cutover_docker inspect "$name" --format '{{index .Config.Labels "com.woodright.deployment-owner"}}' 2>/dev/null || true)\""
  local traefik_enable
  traefik_enable="$(wr_cutover_docker inspect "$name" --format '{{index .Config.Labels "traefik.enable"}}' 2>/dev/null || true)"
  eval "WR_${kind}_TRAEFIK_ENABLE=\"$traefik_enable\""
  if [[ "$traefik_enable" == "true" ]]; then
    log "WARN $kind container '$name' has traefik.enable=true - unexpected for a private production-candidate stack"
  fi
  eval "WR_${kind}_CONTAINER_BINDS='$(wr_cutover_docker inspect "$name" --format '{{json .HostConfig.Binds}}' 2>/dev/null || echo '[]')'"
}

check_lock_status

if need_sf; then inspect_image_candidate SF "$SF_REF"; else WR_SF_PRESENT=n_a; WR_SF_REVISION=""; WR_SF_BUILD_PROFILE=""; WR_SF_REF=""; fi
if need_be; then inspect_image_candidate BE "$BE_REF"; else WR_BE_PRESENT=n_a; WR_BE_REVISION=""; WR_BE_BUILD_PROFILE=""; WR_BE_REF=""; fi

inspect_container BE "${WOODRIGHT_BE_CONTAINER_DEFAULT}"
inspect_container SF "${WOODRIGHT_SF_CONTAINER_DEFAULT}"

export WR_LOCK_STATUS WR_SF_PRESENT WR_SF_REVISION WR_SF_BUILD_PROFILE WR_SF_REF \
  WR_BE_PRESENT WR_BE_REVISION WR_BE_BUILD_PROFILE WR_BE_REF \
  WR_BE_CONTAINER_PRESENT WR_SF_CONTAINER_PRESENT \
  WR_BE_CONTAINER_ID WR_SF_CONTAINER_ID WR_BE_CONTAINER_IMAGE WR_SF_CONTAINER_IMAGE \
  WR_BE_CONTAINER_RESTARTS WR_SF_CONTAINER_RESTARTS \
  WR_BE_CONTAINER_ROLE_LABEL WR_SF_CONTAINER_ROLE_LABEL \
  WR_BE_CONTAINER_OWNER_LABEL WR_SF_CONTAINER_OWNER_LABEL \
  WR_BE_TRAEFIK_ENABLE WR_SF_TRAEFIK_ENABLE \
  WR_BE_CONTAINER_BINDS WR_SF_CONTAINER_BINDS

python3 - "$WOODRIGHT_ENVIRONMENT" "$WOODRIGHT_ENVIRONMENT_CLASS" "$COMPONENT" "$SOURCE_SHA" "$MODE" \
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


packet = {
    "tool": "cutover-production-candidate.sh",
    "mode": mode,
    "environment": environment,
    "environment_class": environment_class,
    "component": component,
    "source_sha": source_sha,
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
    "no_mutation_performed": True,
    "no_lock_held": True,
    "no_pin_writes": True,
    "no_dns_change": True,
}
print(json.dumps(packet, indent=2, sort_keys=True))
PY

if [[ "$MISMATCH" -eq 1 ]]; then
  log "DRY_RUN_MISMATCH sha=$SOURCE_SHA component=$COMPONENT - a locally present candidate image does not match the requested source-sha/profile"
  exit 4
fi

log "DRY_RUN_OK environment=production component=$COMPONENT sha=$SOURCE_SHA (read-only; no lock held, no pins written, no containers touched)"
exit 0
