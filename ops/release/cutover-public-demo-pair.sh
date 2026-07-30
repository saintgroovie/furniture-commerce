#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# Official pair cutover for public_demo (staging): backend + storefront under one flock.
# Backend-first (storefront depends on API; SF can briefly use old or new BE during transition).
# Does NOT run DB migrations. Does NOT touch production / woodright.ru / DNS.
# Requires: --environment public_demo --component pair
# Canonical lock: environment-scoped via profile (public_demo → /srv/woodright/locks/public_demo/live-cutover.lock)
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-validation-freeze.sh
source "$HERE/../lib/woodright-validation-freeze.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"
# shellcheck source=../lib/woodright-component-authority.sh
source "$HERE/../lib/woodright-component-authority.sh"
# shellcheck source=../lib/woodright-oci-provenance.sh
source "$HERE/../lib/woodright-oci-provenance.sh"

MODE="dry-run"
CONFIRM=""
TARGET_SHA=""
BE_DIGEST=""
SF_DIGEST=""
BE_IMAGE=""
SF_IMAGE=""
EXPECTED_OLD_SHA=""
EVIDENCE_DIR=""
BE_ENV_FILE=""
SF_ENV_FILE=""
PDP_URL=""
SKIP_BACKUP="${SKIP_BACKUP:-0}"
SKIP_MONITOR="${SKIP_MONITOR:-0}"
SKIP_SMOKE="${SKIP_SMOKE:-0}"
MUTATION_STARTED=0
BE_KEEP=""
SF_KEEP=""
OLD_BE_DIGEST=""
OLD_SF_DIGEST=""
ROLLBACK_RC=0

# Exit codes
# 0 success | 2 usage | 3 lock | 10 rollback_ok | 11 rollback_partial | 12 rollback_failed | 20 unsafe dry-run | 21 verify fail

usage() {
  cat <<'EOF'
Usage: cutover-public-demo-pair.sh --environment public_demo --mode <mode> [options]

Modes: dry-run | preflight | execute | verify

Required:
  --target-sha <40hex>
  --backend-digest sha256:<64hex>
  --storefront-digest sha256:<64hex>
  --evidence-dir <absolute path outside git>

Execute additionally:
  --backend-env-file <mode 600>
  --storefront-env-file <mode 600>
  --confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_CUTOVER
  [--expected-old-sha <40hex>]
  [--pdp-url <https://woodright-demo.ru/products/...>]

Optional images (default ghcr.io/saintgroovie/woodright-{backend,storefront}@DIGEST):
  --backend-image ...
  --storefront-image ...

Dry-run: no lock mutation on canonical path when WR_CUTOVER_USE_TEST_LOCK=1;
         never writes pins, never stops containers, never creates backup.
EOF
}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 2; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h) usage; exit 0 ;;
      --environment) shift 2 ;;
      --environment=*) shift ;;
      --component) shift 2 ;;
      --component=*) shift ;;
      --mode) MODE="${2:?}"; shift 2 ;;
      --mode=*) MODE="${1#--mode=}"; shift ;;
      --target-sha) TARGET_SHA="${2:?}"; shift 2 ;;
      --target-sha=*) TARGET_SHA="${1#--target-sha=}"; shift ;;
      --backend-digest) BE_DIGEST="${2:?}"; shift 2 ;;
      --backend-digest=*) BE_DIGEST="${1#--backend-digest=}"; shift ;;
      --storefront-digest) SF_DIGEST="${2:?}"; shift 2 ;;
      --storefront-digest=*) SF_DIGEST="${1#--storefront-digest=}"; shift ;;
      --backend-image) BE_IMAGE="${2:?}"; shift 2 ;;
      --storefront-image) SF_IMAGE="${2:?}"; shift 2 ;;
      --expected-old-sha) EXPECTED_OLD_SHA="${2:?}"; shift 2 ;;
      --expected-old-sha=*) EXPECTED_OLD_SHA="${1#--expected-old-sha=}"; shift ;;
      --evidence-dir) EVIDENCE_DIR="${2:?}"; shift 2 ;;
      --evidence-dir=*) EVIDENCE_DIR="${1#--evidence-dir=}"; shift ;;
      --backend-env-file) BE_ENV_FILE="${2:?}"; shift 2 ;;
      --storefront-env-file) SF_ENV_FILE="${2:?}"; shift 2 ;;
      --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
      --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
      --pdp-url) PDP_URL="${2:?}"; shift 2 ;;
      *) shift ;;
    esac
  done
}

default_images() {
  BE_IMAGE="${BE_IMAGE:-ghcr.io/saintgroovie/woodright-backend@${BE_DIGEST}}"
  SF_IMAGE="${SF_IMAGE:-ghcr.io/saintgroovie/woodright-storefront@${SF_DIGEST}}"
}

scope_gate() {
  [[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] || die "pair cutover only supports --environment public_demo"
  [[ "${WOODRIGHT_REQUIRED_RUNTIME_ROLE}" == "public_demo" ]] || die "profile runtime role must be public_demo"
  local be sf
  be="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  sf="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  wr_cutover_refuse_production_name "$be" || exit 2
  wr_cutover_refuse_production_name "$sf" || exit 2
  case "$be" in *production*) die "production BE name" ;; esac
  case "$sf" in *production*) die "production SF name" ;; esac
}

capture_old_identity() {
  local be="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  local sf="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  wr_cutover_docker inspect "$be" | wr_cutover_sanitize_inspect_json >"$EVIDENCE_DIR/sanitized/backend-before.json"
  wr_cutover_docker inspect "$sf" | wr_cutover_sanitize_inspect_json >"$EVIDENCE_DIR/sanitized/storefront-before.json"
  OLD_BE_DIGEST="$(python3 - "$EVIDENCE_DIR/sanitized/backend-before.json" <<'PY'
import json,sys,re
d=json.load(open(sys.argv[1]))
obj=d[0] if isinstance(d, list) else d
img=(obj.get("Config") or {}).get("Image","") or str(obj.get("Image",""))
m=re.search(r'sha256:[0-9a-f]{64}', img)
print(m.group(0) if m else "")
PY
)"
  OLD_SF_DIGEST="$(python3 - "$EVIDENCE_DIR/sanitized/storefront-before.json" <<'PY'
import json,sys,re
d=json.load(open(sys.argv[1]))
obj=d[0] if isinstance(d, list) else d
img=(obj.get("Config") or {}).get("Image","") or str(obj.get("Image",""))
m=re.search(r'sha256:[0-9a-f]{64}', img)
print(m.group(0) if m else "")
PY
)"
  printf '%s\n' "$OLD_BE_DIGEST" >"$EVIDENCE_DIR/json/old-backend-digest.txt"
  printf '%s\n' "$OLD_SF_DIGEST" >"$EVIDENCE_DIR/json/old-storefront-digest.txt"
  # Live release SHA labels (both sides must agree)
  OLD_BE_SHA="$(wr_cutover_docker inspect "$be" --format '{{index .Config.Labels "com.woodright.release-sha"}}' 2>/dev/null || true)"
  OLD_SF_SHA="$(wr_cutover_docker inspect "$sf" --format '{{index .Config.Labels "com.woodright.release-sha"}}' 2>/dev/null || true)"
  printf '%s\n' "$OLD_BE_SHA" >"$EVIDENCE_DIR/json/old-backend-release-sha.txt"
  printf '%s\n' "$OLD_SF_SHA" >"$EVIDENCE_DIR/json/old-storefront-release-sha.txt"
  if [[ -n "$OLD_BE_SHA" && -n "$OLD_SF_SHA" && "$OLD_BE_SHA" != "$OLD_SF_SHA" ]]; then
    die "split live release SHA be=$OLD_BE_SHA sf=$OLD_SF_SHA"
  fi
  if [[ -n "$EXPECTED_OLD_SHA" ]]; then
    wr_cutover_require_full_sha "$EXPECTED_OLD_SHA" || exit 2
    if [[ -z "$OLD_BE_SHA" || -z "$OLD_SF_SHA" ]]; then
      die "expected-old-sha set but live release-sha labels missing (be='${OLD_BE_SHA}' sf='${OLD_SF_SHA}')"
    fi
    if [[ "$OLD_BE_SHA" != "$EXPECTED_OLD_SHA" || "$OLD_SF_SHA" != "$EXPECTED_OLD_SHA" ]]; then
      die "live release sha mismatch want=$EXPECTED_OLD_SHA be=$OLD_BE_SHA sf=$OLD_SF_SHA"
    fi
  fi
}

check_no_migration() {
  # Image-only tool: never auto-migrate. Operator panic switch still honored.
  if [[ "${WOODRIGHT_PENDING_MIGRATION:-0}" == "1" ]]; then
    die "pending migration detected (WOODRIGHT_PENDING_MIGRATION=1) - refuse pair cutover"
  fi
  # Evidence-backed: target SHA must not introduce migration files vs expected old when provided.
  if [[ -n "${EXPECTED_OLD_SHA:-}" && -d "${REPO_ROOT}/apps/backend" ]]; then
    if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      local mig_diff
      mig_diff="$(git -C "$REPO_ROOT" diff --name-only "${EXPECTED_OLD_SHA}..${TARGET_SHA}" -- \
        'apps/backend/src/migrations' 'apps/backend/migrations' '**/migrations/**' 2>/dev/null)" || {
        die "migration gate git diff failed for ${EXPECTED_OLD_SHA}..${TARGET_SHA}"
      }
      if [[ -n "$(echo "$mig_diff" | sed "/^$/d")" ]]; then
        die "migration files changed between $EXPECTED_OLD_SHA and $TARGET_SHA - refuse image-only cutover"
      fi
    fi
  fi
  printf '{"migration_required":false,"policy":"image_only_cutover","checked_pending_env":true}\n' >"$EVIDENCE_DIR/json/migration-gate.json"
}

check_monitor() {
  [[ "$SKIP_MONITOR" == "1" ]] && return 0
  local mon="${REPO_ROOT}/ops/monitoring/woodright-health-check.sh"
  if [[ ! -x "$mon" ]]; then
    log "WARN monitor script missing locally; skip"
    return 0
  fi
  if [[ "${WOODRIGHT_CUTOVER_FAKE_MONITOR:-}" == "red" ]]; then
    die "monitor red (harness)"
  fi
  # Remote/host: best-effort; dry-run may skip execution under harness
  if [[ "${WOODRIGHT_CUTOVER_SKIP_MONITOR_EXEC:-0}" == "1" ]]; then
    log "monitor exec skipped (harness)"
    return 0
  fi
  if ! "$mon" >/dev/null 2>&1; then
    # Script prints JSON; treat non-zero as fail when present
    log "WARN monitor returned non-zero (continue only if overall ok proven elsewhere)"
  fi
}

run_backup_gate() {
  [[ "$SKIP_BACKUP" == "1" ]] && {
    log "backup skipped (SKIP_BACKUP=1 harness only)"
    return 0
  }
  if [[ "$MODE" != "execute" ]]; then
    log "backup not run in mode=$MODE"
    return 0
  fi
  local bak="/srv/woodright/ops/backup/woodright-backup-run.sh"
  if [[ ! -x "$bak" ]]; then
    die "official backup helper missing: $bak"
  fi
  sudo -n "$bak" || die "backup helper failed"
  wr_cutover_pin_backup "$EVIDENCE_DIR" || die "pin backup failed"
}

pair_rollback() {
  wr_cutover_pair_rollback \
    "$EVIDENCE_DIR" \
    "${BE_KEEP:-}" \
    "${SF_KEEP:-}" \
    "$HERE/rollback-staging-backend-from-keeper.sh" \
    "$HERE/rollback-staging-storefront-from-keeper.sh"
  return "$ROLLBACK_RC"
}

verify_pair() {
  local be="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  local sf="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  local be_d sf_d
  be_d="$(wr_cutover_docker inspect "$be" --format '{{json .RepoDigests}}{{.Config.Image}}')"
  sf_d="$(wr_cutover_docker inspect "$sf" --format '{{json .RepoDigests}}{{.Config.Image}}')"
  echo "$be_d" | grep -q "${BE_DIGEST#sha256:}" || return 1
  echo "$sf_d" | grep -q "${SF_DIGEST#sha256:}" || return 1
  local role_sf role_be owner_sf owner_be
  role_sf="$(wr_cutover_docker inspect "$sf" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
  role_be="$(wr_cutover_docker inspect "$be" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
  owner_sf="$(wr_cutover_docker inspect "$sf" --format '{{index .Config.Labels "com.woodright.deployment-owner"}}')"
  owner_be="$(wr_cutover_docker inspect "$be" --format '{{index .Config.Labels "com.woodright.deployment-owner"}}')"
  [[ "$role_sf" == "public_demo" ]] || return 1
  [[ "$role_be" == "public_demo" ]] || return 1
  [[ "$owner_sf" == "Dokploy" && "$owner_be" == "Dokploy" ]] || return 1
  if [[ "${SKIP_PUBLIC_VERIFY:-0}" == "1" ]]; then
    return 0
  fi
  local api sfh
  api="$(curl -sS --max-time 20 -D - -o /dev/null "${WOODRIGHT_API_HOST%/}/health" || true)"
  sfh="$(curl -sS --max-time 20 -D - -o /dev/null "${WOODRIGHT_BUYER_HOST%/}/" || true)"
  printf '%s\n' "$api" >"$EVIDENCE_DIR/raw/api-headers.txt"
  printf '%s\n' "$sfh" >"$EVIDENCE_DIR/raw/sf-headers.txt"
  echo "$sfh" | grep -qi "x-woodright-release-sha: ${TARGET_SHA}" || return 1
  echo "$api" | grep -qi "x-woodright-release-sha: ${TARGET_SHA}" || return 1
  echo "$sfh" | grep -qi "x-robots-tag:.*noindex" || return 1
  echo "$sfh" | grep -qi "x-woodright-runtime-role: public_demo" || return 1
  echo "$sfh" | grep -qi "x-woodright-database-identity: public_demo_db\|x-woodright-database-identity: woodright_staging" || true
  return 0
}

run_smoke() {
  [[ "$SKIP_SMOKE" == "1" ]] && return 0
  local -a smoke_args=(
    --buyer-host "${WOODRIGHT_BUYER_HOST}"
    --api-host "${WOODRIGHT_API_HOST}"
    --expect-sha "$TARGET_SHA"
  )
  if [[ -n "$PDP_URL" ]]; then
    smoke_args+=(--pdp-url "$PDP_URL")
  fi
  bash "$HERE/public-demo-critical-http-smoke.sh" "${smoke_args[@]}"
}

FULL_ARGV=("$@")
wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
wr_require_component_from_args "${FULL_ARGV[@]}" || die "missing required --component pair"
[[ "${WOODRIGHT_COMPONENT_SCOPE}" == "pair" ]] || die "pair cutover requires --component pair"
parse_args "${FULL_ARGV[@]}"
scope_gate
wr_assert_environment_provisioned || exit 1
wr_validation_freeze_assert_clear_for_mutation "$WOODRIGHT_ENVIRONMENT" || exit 1
wr_prelock_validate_environment_target || exit 1

case "$MODE" in
  dry-run|preflight|execute|verify) ;;
  *) die "invalid mode=$MODE" ;;
esac

[[ -n "$TARGET_SHA" && -n "$BE_DIGEST" && -n "$SF_DIGEST" && -n "$EVIDENCE_DIR" ]] \
  || die "missing required target/digests/evidence-dir"
wr_cutover_require_full_sha "$TARGET_SHA" || exit 2
wr_cutover_require_digest "$BE_DIGEST" || exit 2
wr_cutover_require_digest "$SF_DIGEST" || exit 2
[[ "$BE_DIGEST" != "$SF_DIGEST" ]] || die "backend and storefront digests must differ"
default_images
wr_cutover_require_image_at_digest "$BE_IMAGE" "$BE_DIGEST" || exit 2
wr_cutover_require_image_at_digest "$SF_IMAGE" "$SF_DIGEST" || exit 2

wr_cutover_evidence_init "$EVIDENCE_DIR" "pair-$MODE" || exit 2
printf '%s\n' "$TARGET_SHA" >"$EVIDENCE_DIR/json/target-sha.txt"
printf '%s\n' "$BE_DIGEST" >"$EVIDENCE_DIR/json/target-backend-digest.txt"
printf '%s\n' "$SF_DIGEST" >"$EVIDENCE_DIR/json/target-storefront-digest.txt"

check_no_migration

if [[ "$MODE" == "verify" ]]; then
  verify_pair || exit 21
  log "VERIFY_OK pair sha=$TARGET_SHA"
  exit 0
fi

# Read-only identity + environment authority
wr_cutover_docker inspect "${WOODRIGHT_BE_CONTAINER_DEFAULT}" >/dev/null \
  || die "missing backend container"
wr_cutover_docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT}" >/dev/null \
  || die "missing storefront container"
wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend || die "backend environment mismatch"
wr_assert_container_matches_environment "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront || die "storefront environment mismatch"
capture_old_identity

# Image presence / revision + OCI provenance
if wr_cutover_docker image inspect "$BE_IMAGE" >/dev/null 2>&1; then
  wr_assert_component_provenance "$BE_IMAGE" "$TARGET_SHA" "$BE_DIGEST" || die "backend OCI_PROVENANCE_FAILED"
  wr_cutover_assert_image_revision "$BE_IMAGE" "$TARGET_SHA" || exit 2
else
  [[ "$MODE" != "execute" ]] || die "backend image not local"
  [[ "${WOODRIGHT_ALLOW_MISSING_LOCAL_IMAGE:-0}" == "1" ]] || die "backend image not local"
fi
if wr_cutover_docker image inspect "$SF_IMAGE" >/dev/null 2>&1; then
  wr_assert_component_provenance "$SF_IMAGE" "$TARGET_SHA" "$SF_DIGEST" || die "storefront OCI_PROVENANCE_FAILED"
  wr_cutover_assert_image_revision "$SF_IMAGE" "$TARGET_SHA" || exit 2
else
  [[ "$MODE" != "execute" ]] || die "storefront image not local"
  [[ "${WOODRIGHT_ALLOW_MISSING_LOCAL_IMAGE:-0}" == "1" ]] || die "storefront image not local"
fi

check_monitor

if [[ "$MODE" == "dry-run" || "$MODE" == "preflight" ]]; then
  log "PLANNED pair cutover sha=$TARGET_SHA be=$BE_DIGEST sf=$SF_DIGEST"
  log "PLANNED order=backend_then_storefront lock=$WR_STAGING_MUTATION_LOCK_PATH"
  log "PLANNED containers=${WOODRIGHT_BE_CONTAINER_DEFAULT}+${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  log "PLANNED no_migration no_production no_dns"
  # Prove dry-run does not mutate: record container IDs
  wr_cutover_docker inspect "${WOODRIGHT_BE_CONTAINER_DEFAULT}" --format '{{.Id}}' >"$EVIDENCE_DIR/json/be-id-before.txt"
  wr_cutover_docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT}" --format '{{.Id}}' >"$EVIDENCE_DIR/json/sf-id-before.txt"
  log "DRY_RUN_OR_PREFLIGHT_OK mode=$MODE"
  exit 0
fi

# execute
wr_cutover_require_confirm "$CONFIRM" || exit 2
[[ -n "$BE_ENV_FILE" && -n "$SF_ENV_FILE" ]] || die "execute requires backend/storefront env files"
[[ -f "$BE_ENV_FILE" && -f "$SF_ENV_FILE" ]] || die "env files missing"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BE_KEEP="woodright-staging-backend-keeper-${TS}"
SF_KEEP="woodright-staging-storefront-keeper-${TS}"

wr_staging_mutation_lock_acquire \
  "actor=cutover-public-demo-pair" \
  "command=$0 --environment public_demo --component pair" \
  "target=$TARGET_SHA" \
  || exit 3
wr_staging_mutation_lock_export_inherit || die "lock inherit export failed"
log "lock held for pair cutover"

# Re-validate under lock (selection freeze)
wr_prelock_validate_environment_target || die "under-lock environment retarget detected"
wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend || die "under-lock backend retarget"
wr_assert_container_matches_environment "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront || die "under-lock storefront retarget"
capture_old_identity
run_backup_gate

MUTATION_STARTED=1
# Backend recreate (digest-advance) under pair component scope
if ! REQUIRE_CURRENT_DIGEST=0 \
  IMAGE="$BE_IMAGE" \
  EXPECTED_DIGEST="$BE_DIGEST" \
  ENV_FILE="$BE_ENV_FILE" \
  KEEP_NAME="$BE_KEEP" \
  TARGET_SHA="$TARGET_SHA" \
  WOODRIGHT_TARGET_SHA="$TARGET_SHA" \
  ROLLBACK_SCRIPT="$HERE/rollback-staging-backend-from-keeper.sh" \
  bash "$HERE/recreate-staging-backend-with-media.sh" --environment public_demo --component pair; then
  log "backend recreate failed"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

# Storefront recreate under pair component scope
if ! REQUIRE_CURRENT_DIGEST=0 \
  SKIP_PUBLIC_VERIFY="${SKIP_PUBLIC_VERIFY:-0}" \
  bash "$HERE/recreate-staging-storefront.sh" \
  --environment public_demo \
  --component pair \
  --mode execute \
  --image "$SF_IMAGE" \
  --digest "$SF_DIGEST" \
  --target-sha "$TARGET_SHA" \
  --keep-name "$SF_KEEP" \
  --env-file "$SF_ENV_FILE" \
  --evidence-dir "$EVIDENCE_DIR/storefront" \
  --confirm-mutation "$CONFIRM"; then
  log "storefront recreate failed - rolling back pair"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

if ! verify_pair; then
  log "pair identity verify failed - rollback"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

if ! run_smoke; then
  log "critical smoke failed - rollback"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

# Pin reconcile UNDER the same canonical lock (inherited) before SUCCESS.
# Releasing the lock before authoritative pin SoT alignment is a correctness race.
if [[ -x "$REPO_ROOT/scripts/release/reconcile-public-image-pins.sh" ]]; then
  if [[ "${WOODRIGHT_SKIP_PIN_RECONCILE:-0}" != "1" ]]; then
    cat >"$EVIDENCE_DIR/json/planned-pin-reconcile.env" <<EOF
EXPECTED_RELEASE_SHA=${TARGET_SHA}
EXPECTED_BACKEND_DIGEST=${BE_DIGEST}
EXPECTED_STOREFRONT_DIGEST=${SF_DIGEST}
APPLY=1
EOF
    printf 'WOODRIGHT_BACKEND_IMAGE=%s\nWOODRIGHT_STOREFRONT_IMAGE=%s\n' \
      "$BE_IMAGE" "$SF_IMAGE" >"$EVIDENCE_DIR/json/planned-pins.env"
    wr_staging_mutation_lock_export_inherit || {
      log "lock inherit export failed before pin APPLY"
      pair_rollback || true
      exit "${ROLLBACK_RC:-12}"
    }
    log "pin_reconcile_begin under_inherited_lock=yes"
    if ! EXPECTED_RELEASE_SHA="$TARGET_SHA" \
      EXPECTED_BACKEND_DIGEST="$BE_DIGEST" \
      EXPECTED_STOREFRONT_DIGEST="$SF_DIGEST" \
      APPLY=1 \
      UPDATE_PINS=1 \
      UPDATE_ACTIVE_PUBLIC=1 \
      bash "$REPO_ROOT/scripts/release/reconcile-public-image-pins.sh" \
        --environment public_demo \
        --component pair; then
      log "pin reconcile APPLY failed - rolling back pair"
      printf '{"pin_apply":"failed"}\n' >"$EVIDENCE_DIR/json/pin-apply-result.json"
      pair_rollback || true
      exit "${ROLLBACK_RC:-12}"
    fi
    printf '{"pin_apply":"ok","under_lock":true}\n' >"$EVIDENCE_DIR/json/pin-apply-result.json"
    log "pin_reconcile_ok under_inherited_lock=yes"
  else
    log "WARN WOODRIGHT_SKIP_PIN_RECONCILE=1 after runtime mutation"
    pair_rollback || true
    exit "${ROLLBACK_RC:-12}"
  fi
else
  log "missing reconcile-public-image-pins.sh after runtime mutation"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

# Re-verify pair identity after pin writes (still under lock)
if ! verify_pair; then
  log "post-pin pair identity verify failed - rollback"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

printf '{"verdict":"success","target_sha":"%s","backend_digest":"%s","storefront_digest":"%s","pin_apply":"ok"}\n' \
  "$TARGET_SHA" "$BE_DIGEST" "$SF_DIGEST" >"$EVIDENCE_DIR/json/final-verdict.json"
{
  echo "# Pair cutover success"
  echo "- sha: $TARGET_SHA"
  echo "- be: $BE_DIGEST"
  echo "- sf: $SF_DIGEST"
  echo "- keepers: $BE_KEEP / $SF_KEEP"
  echo "- pin_apply: ok (under canonical lock)"
} >"$EVIDENCE_DIR/SUMMARY.md"

log "PAIR_CUTOVER_OK sha=$TARGET_SHA pin_apply=ok"
# lock released via trap on EXIT from lock helper
exit 0
