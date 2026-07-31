#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# STAGING_MEDIA_REPAIR_ONLY
# Durable flock recreate path for woodright-staging-backend.
# Preserves exact image digest + env; ALWAYS mounts staging media at /server/static.
# After healthy: MUST pass ops/release/verify-backend-media-mount.sh (fail-closed).
# Manifest updates: ops/release/reconcile-runtime-manifests.sh only (runs assert/gate first).
# Canonical exclusive lock: environment-scoped via profile
#   /srv/woodright/locks/public_demo/live-cutover.lock
# Legacy allowlisted: /srv/woodright/locks/live-cutover.lock
# Requires explicit: --environment public_demo --component backend|pair
# staging is unprovisioned and must not select public_demo containers.
# Pair cutover parent may nest via WOODRIGHT_STAGING_MUTATION_LOCK_HELD + owned FD.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-validation-freeze.sh
source "$HERE/../lib/woodright-validation-freeze.sh"
# shellcheck source=../lib/woodright-component-authority.sh
source "$HERE/../lib/woodright-component-authority.sh"
# shellcheck source=../lib/woodright-oci-provenance.sh
source "$HERE/../lib/woodright-oci-provenance.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die_early() { log "ERROR: $*"; exit 1; }

wr_require_environment_from_args "$@" || exit 1
wr_assert_environment_provisioned || exit 1
wr_require_canonical_db_identity || exit 1
[[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] || die_early "only --environment public_demo allowed for this helper (got ${WOODRIGHT_ENVIRONMENT}; staging is not an alias for public_demo)"
wr_require_component_from_args "$@" || die_early "missing required --component <backend|pair> for backend recreate"
[[ "${WOODRIGHT_COMPONENT_SCOPE}" == "backend" || "${WOODRIGHT_COMPONENT_SCOPE}" == "pair" ]] || die_early "backend recreate requires --component backend|pair"
wr_validation_freeze_assert_clear_for_mutation "$WOODRIGHT_ENVIRONMENT" || exit 1
wr_prelock_validate_environment_target || exit 1

IMAGE="${IMAGE:?set IMAGE to exact digest ref}"
ENV_FILE="${ENV_FILE:?set ENV_FILE}"
EXPECTED_DIGEST="${EXPECTED_DIGEST:?set EXPECTED_DIGEST sha256:<64hex>}"
TARGET_SHA="${TARGET_SHA:-${WOODRIGHT_TARGET_SHA:-}}"
[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || die_early "TARGET_SHA / WOODRIGHT_TARGET_SHA required (40-hex) for OCI provenance"
KEEP_NAME="${KEEP_NAME:?set KEEP_NAME}"
# Deprecated alias kept for rollback script env compatibility only (not the mutex).
LOCK_FILE="${LOCK_FILE:-${WOODRIGHT_OWNERSHIP_DIR}/DEPLOY.lock}"
# Prefer in-repo keeper rollback; VM legacy path remains overridable via ROLLBACK_SCRIPT.
ROLLBACK_SCRIPT="${ROLLBACK_SCRIPT:-$HERE/rollback-staging-backend-from-keeper.sh}"
REQUIRE_CURRENT_DIGEST="${REQUIRE_CURRENT_DIGEST:-1}"

# Profile is authority for NAME/VOLUME/NET (ignore conflicting inherited overrides)
if [[ -n "${NAME:-}" && "$NAME" != "${WOODRIGHT_BE_CONTAINER_DEFAULT}" ]]; then
  case "$NAME" in
    ${WOODRIGHT_BE_NAME_PREFIX}*) ;;
    *) die_early "NAME='$NAME' rejected for environment=${WOODRIGHT_ENVIRONMENT}" ;;
  esac
fi
NAME="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
NET_STACK="${WOODRIGHT_NET_STACK}"
NET_DOKPLOY="${WOODRIGHT_NET_DOKPLOY:-dokploy-network}"
VOLUME="${WOODRIGHT_MEDIA_VOLUME}"
DEST="${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}"
wr_assert_media_volume_for_environment "$VOLUME" || exit 1
case "$NAME" in
  *production*|*"woodright.ru"*) die_early "refused: production-like NAME=$NAME" ;;
esac

# 0=not stopped, 1=stopped but not renamed, 2=renamed to keeper
PHASE=0
RECOVERING=0

recover() {
  local rc=${1:-1}
  if [[ "$RECOVERING" -eq 1 ]]; then
    log "recover_reentrancy_skip rc=$rc"
    return "$rc"
  fi
  RECOVERING=1
  log "RECOVER begin phase=$PHASE rc=$rc"
  if [[ "$PHASE" -eq 1 ]]; then
    # stopped but rename failed - restart original live name
    docker start "$NAME" || log "recover_restart_failed"
    log "RECOVER restarted original $NAME"
  elif [[ "$PHASE" -eq 2 ]]; then
    # In-repo rollback uses CLI; legacy VM script may still consume NAME/KEEP_NAME env.
    if [[ "$(basename "$ROLLBACK_SCRIPT")" == "rollback-staging-backend-from-keeper.sh" ]]; then
      bash "$ROLLBACK_SCRIPT" --environment public_demo \
        --keep-name "$KEEP_NAME" \
        --evidence-dir "${WOODRIGHT_CUTOVER_EVIDENCE_DIR:-/tmp}" \
        || log "AUTO_ROLLBACK_SCRIPT_FAILED"
    else
      # Legacy VM rollback scripts may still honor SKIP_FLOCK=1; in-repo helper does not.
      SKIP_FLOCK=1 NAME="$NAME" KEEP_NAME="$KEEP_NAME" EXPECTED_DIGEST="$EXPECTED_DIGEST" IMAGE="$IMAGE" \
        LOCK_FILE="$LOCK_FILE" NET_STACK="$NET_STACK" NET_DOKPLOY="$NET_DOKPLOY" \
        bash "$ROLLBACK_SCRIPT" || log "AUTO_ROLLBACK_SCRIPT_FAILED"
    fi
  fi
  RECOVERING=0
  return "$rc"
}

on_err() {
  local rc=$?
  recover "$rc" || true
  exit "$rc"
}
trap on_err ERR

die() {
  log "ERROR: $*"
  recover 1 || true
  exit 1
}

[[ "$EXPECTED_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "EXPECTED_DIGEST must be sha256:<64hex>"
[[ "$IMAGE" == *"@${EXPECTED_DIGEST}" ]] || die "IMAGE must be repo@${EXPECTED_DIGEST}"
TARGET_SHA="${TARGET_SHA:-${WOODRIGHT_TARGET_SHA:-}}"
[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || die "TARGET_SHA/WOODRIGHT_TARGET_SHA must be full 40-hex for release-sha label"

[[ -f "$ENV_FILE" ]] || die "missing ENV_FILE=$ENV_FILE"
ENV_MODE="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")"
[[ "$ENV_MODE" == "600" || "$ENV_MODE" == "0600" ]] || die "ENV_FILE mode must be 600 (have $ENV_MODE)"
[[ -f "$ROLLBACK_SCRIPT" ]] || die "missing ROLLBACK_SCRIPT=$ROLLBACK_SCRIPT"
# Best-effort touch of legacy DEPLOY.lock path for older docs/tools; not authoritative.
[[ -f "$LOCK_FILE" ]] || touch "$LOCK_FILE" || true

# Static infrastructure prechecks (no live container mutation) before lock.
docker volume inspect "$VOLUME" >/dev/null || die "missing volume $VOLUME"
docker network inspect "$NET_STACK" >/dev/null || die "missing network $NET_STACK"
docker network inspect "$NET_DOKPLOY" >/dev/null || die "missing network $NET_DOKPLOY"
docker image inspect "$IMAGE" >/dev/null || die "image ref not local: $IMAGE"
RESOLVED_ID="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
log "resolved_image_id=$RESOLVED_ID expected_digest=$EXPECTED_DIGEST"

# Fail-closed media promotion gate BEFORE declaring success / any manifest reconcile.
REPO_ROOT="${WOODRIGHT_REPO_ROOT:-}"
if [[ -z "$REPO_ROOT" ]]; then
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -x "$HERE/verify-backend-media-mount.sh" ]]; then
    GATE="$HERE/verify-backend-media-mount.sh"
  else
    die "set WOODRIGHT_REPO_ROOT or install verify-backend-media-mount.sh beside this script"
  fi
else
  GATE="$REPO_ROOT/ops/release/verify-backend-media-mount.sh"
fi
[[ -x "$GATE" ]] || die "media gate missing: $GATE"

# Mode A — pre-promote target validation BEFORE any live mutation.
# Does not require EXPECTED_RELEASE to already list the target digest.
log "running_pre_promote_media_gate gate=$GATE target=$EXPECTED_DIGEST"
PRE_ARGS=(--environment "$WOODRIGHT_ENVIRONMENT" --mode pre-promote --target-image "$IMAGE" --expected-digest "$EXPECTED_DIGEST" --media-volume "$VOLUME" --mount-destination "$DEST" --target-sha "$TARGET_SHA")
wr_assert_component_provenance "$IMAGE" "$TARGET_SHA" "$EXPECTED_DIGEST" || die "OCI_PROVENANCE_FAILED"
bash "$GATE" "${PRE_ARGS[@]}" || die "MEDIA_PRE_PROMOTE_GATE_FAILED"

# Freeze storefront peer before backend mutation when scope=backend
if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "backend" ]]; then
  wr_freeze_peer_digest storefront "${WOODRIGHT_SF_CONTAINER_DEFAULT}" || die "cannot freeze storefront peer"
fi

wr_staging_mutation_lock_acquire \
  "actor=recreate-staging-backend-with-media" \
  "command=$0 --environment $WOODRIGHT_ENVIRONMENT" \
  "target=$EXPECTED_DIGEST" \
  || die "canonical environment lock busy/unavailable"
log "flock_acquired lock=$WR_STAGING_MUTATION_LOCK_PATH"
wr_validation_freeze_assert_clear_for_mutation "$WOODRIGHT_ENVIRONMENT" || die "validation freeze active under lock"
wr_prelock_validate_environment_target || die "under-lock environment retarget detected"

# Re-run Mode A under the lock (no live mutation; closes TOCTOU before stop).
bash "$GATE" "${PRE_ARGS[@]}" || die "MEDIA_PRE_PROMOTE_GATE_FAILED_UNDER_LOCK"

# Live identity checks ONLY under the lock (re-validated immediately before stop).
if docker inspect "$KEEP_NAME" >/dev/null 2>&1; then
  die "keeper already exists: $KEEP_NAME"
fi
docker inspect "$NAME" >/dev/null || die "live container missing: $NAME"
CUR_IMG="$(docker inspect "$NAME" --format '{{.Image}}')"
log "current_image_id=$CUR_IMG"
if [[ "$REQUIRE_CURRENT_DIGEST" == "1" ]]; then
  if [[ "$CUR_IMG" != "$RESOLVED_ID" ]]; then
    die "live image id mismatch want=$RESOLVED_ID have=$CUR_IMG (for digest-advance set REQUIRE_CURRENT_DIGEST=0 after Mode A PASS)"
  fi
fi
# Digest-advance path: REQUIRE_CURRENT_DIGEST=0 allows current != target; Mode A + Mode B pin target.

# Governance identity alias ≠ physical PostgreSQL DB name (WOODRIGHT_DB_NAME).
# Resolve BEFORE stop/rename so a missing alias cannot leave the stack half-mutated.
DB_IDENTITY_ALIAS="$(wr_canonical_db_identity_label)" || die_early "canonical DB identity unavailable"
[[ "$DB_IDENTITY_ALIAS" == "public_demo_db" ]] || die_early "public_demo backend requires database-identity=public_demo_db (got '$DB_IDENTITY_ALIAS')"
if [[ -n "${WOODRIGHT_DATABASE_CONNECTION_NAME:-}" && "$DB_IDENTITY_ALIAS" == "${WOODRIGHT_DATABASE_CONNECTION_NAME}" ]]; then
  die_early "refusing governance identity equal to physical DB name ($DB_IDENTITY_ALIAS)"
fi
if [[ -n "${EVIDENCE_DIR:-}" ]]; then
  mkdir -p "$EVIDENCE_DIR/json"
  printf '{"database_connection_name":"%s","database_identity_alias":"%s"}\n' \
    "${WOODRIGHT_DATABASE_CONNECTION_NAME:-}" "$DB_IDENTITY_ALIAS" \
    >"$EVIDENCE_DIR/json/database-identity-plan.json"
fi
log "PLANNED database_identity_alias=$DB_IDENTITY_ALIAS database_connection_name=${WOODRIGHT_DATABASE_CONNECTION_NAME:-none}"

# All non-destructive checks completed BEFORE stop
docker stop "$NAME"
PHASE=1
log "stopped_live $NAME"

docker rename "$NAME" "$KEEP_NAME"
PHASE=2
log "renamed_to_keeper $KEEP_NAME"

docker create \
  --name "$NAME" \
  --restart unless-stopped \
  --network "$NET_STACK" \
  --network-alias backend \
  --label "com.woodright.deployment-owner=Dokploy" \
  --label "com.woodright.runtime-role=public_demo" \
  --label "com.woodright.exposure=public" \
  --label "com.woodright.release-sha=${TARGET_SHA}" \
  --label "com.woodright.database-identity=${DB_IDENTITY_ALIAS}" \
  --env-file "$ENV_FILE" \
  --mount "type=volume,source=${VOLUME},destination=${DEST}" \
  --health-cmd="node -e \"fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=5 \
  --health-start-period=60s \
  "$IMAGE" \
  ./node_modules/.bin/medusa start

docker network connect "$NET_DOKPLOY" "$NAME"
docker start "$NAME"

NEW_IMG="$(docker inspect "$NAME" --format '{{.Image}}')"
[[ "$NEW_IMG" == "$RESOLVED_ID" ]] || die "new image id mismatch want=$RESOLVED_ID have=$NEW_IMG"

MOUNT_JSON="$(docker inspect "$NAME" --format '{{json .Mounts}}')"
echo "$MOUNT_JSON" | grep -q "$VOLUME" || die "mount volume missing in inspect"
echo "$MOUNT_JSON" | grep -q "$DEST" || die "mount destination missing in inspect"

for i in $(seq 1 36); do
  st="$(docker inspect "$NAME" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')"
  log "health_i=$i status=$st"
  if [[ "$st" == "healthy" ]]; then
    break
  fi
  if [[ "$st" == "exited" ]]; then
    docker logs "$NAME" 2>&1 | tail -80 || true
    die "container exited"
  fi
  sleep 5
done
st="$(docker inspect "$NAME" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
[[ "$st" == "healthy" ]] || die "not healthy after wait: $st"

# Fail-closed Mode B post-promote gate: pin target digest (EXPECTED_RELEASE may still be old).
EVIDENCE_PATH="${WOODRIGHT_MEDIA_GATE_EVIDENCE:-/tmp/woodright-media-gate-evidence-${EXPECTED_DIGEST##sha256:}.json}"
log "running_post_promote_media_gate gate=$GATE container=$NAME digest=$EXPECTED_DIGEST"
POST_ARGS=(--environment "$WOODRIGHT_ENVIRONMENT" --mode post-promote --container "$NAME" --expected-digest "$EXPECTED_DIGEST" --media-volume "$VOLUME" --mount-destination "$DEST" --write-evidence "$EVIDENCE_PATH" --target-sha "$TARGET_SHA")
if [[ -n "${WOODRIGHT_BUYER_HOST:-}" ]]; then
  POST_ARGS+=(--buyer-host "$WOODRIGHT_BUYER_HOST")
fi
bash "$GATE" "${POST_ARGS[@]}" \
  || die "MEDIA_PROMOTION_GATE_FAILED - refusing to declare recreate success (keeper=$KEEP_NAME)"

# Peer freeze check after mutation
if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "backend" ]]; then
  wr_assert_peer_unchanged storefront "${WOODRIGHT_SF_CONTAINER_DEFAULT}" || die "storefront peer changed during backend-only"
fi

trap - ERR
PHASE=0
log "CREATED name=$NAME image=$IMAGE mount=${VOLUME}:${DEST} keeper=$KEEP_NAME media_gate=PASS evidence=$EVIDENCE_PATH"
log "NOTE: update ACTIVE_OWNER/EXPECTED_RELEASE only via ops/release/reconcile-runtime-manifests.sh"
