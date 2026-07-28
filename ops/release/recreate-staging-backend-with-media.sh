#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# STAGING_MEDIA_REPAIR_ONLY
# Durable flock recreate path for woodright-staging-backend.
# Preserves exact image digest + env; ALWAYS mounts staging media at /server/static.
# After healthy: MUST pass ops/release/verify-backend-media-mount.sh (fail-closed).
# Manifest updates: ops/release/reconcile-runtime-manifests.sh only (runs assert/gate first).
# Canonical exclusive lock: /srv/woodright/locks/live-cutover.lock (via ops/lib helper).
# Legacy DEPLOY.lock is no longer the mutex; do not invent a second lock.
set -euo pipefail

NAME="${NAME:-woodright-staging-backend}"
IMAGE="${IMAGE:?set IMAGE to exact digest ref}"
ENV_FILE="${ENV_FILE:?set ENV_FILE}"
EXPECTED_DIGEST="${EXPECTED_DIGEST:?set EXPECTED_DIGEST sha256:<64hex>}"
NET_STACK="${NET_STACK:-woodright-stack-3dsdhd_woodright_staging}"
NET_DOKPLOY="${NET_DOKPLOY:-dokploy-network}"
VOLUME="${VOLUME:-woodright-stack-3dsdhd_woodright_staging_media}"
DEST="${DEST:-/server/static}"
KEEP_NAME="${KEEP_NAME:?set KEEP_NAME}"
# Deprecated alias kept for rollback script env compatibility only (not the mutex).
LOCK_FILE="${LOCK_FILE:-/srv/woodright/runtime-ownership/DEPLOY.lock}"
ROLLBACK_SCRIPT="${ROLLBACK_SCRIPT:-/srv/woodright/runtime-ownership/rollback-staging-backend-media-repair.sh}"
REQUIRE_CURRENT_DIGEST="${REQUIRE_CURRENT_DIGEST:-1}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"

# 0=not stopped, 1=stopped but not renamed, 2=renamed to keeper
PHASE=0
RECOVERING=0

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

recover() {
  local rc=${1:-1}
  if [[ "$RECOVERING" -eq 1 ]]; then
    log "recover_reentrancy_skip rc=$rc"
    return "$rc"
  fi
  RECOVERING=1
  log "RECOVER begin phase=$PHASE rc=$rc"
  if [[ "$PHASE" -eq 1 ]]; then
    # stopped but rename failed — restart original live name
    docker start "$NAME" || log "recover_restart_failed"
    log "RECOVER restarted original $NAME"
  elif [[ "$PHASE" -eq 2 ]]; then
    SKIP_FLOCK=1 NAME="$NAME" KEEP_NAME="$KEEP_NAME" EXPECTED_DIGEST="$EXPECTED_DIGEST" IMAGE="$IMAGE" \
      LOCK_FILE="$LOCK_FILE" NET_STACK="$NET_STACK" NET_DOKPLOY="$NET_DOKPLOY" \
      bash "$ROLLBACK_SCRIPT" || log "AUTO_ROLLBACK_SCRIPT_FAILED"
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

wr_staging_mutation_lock_acquire \
  "actor=recreate-staging-backend-with-media" \
  "command=$0" \
  "target=$EXPECTED_DIGEST" \
  || die "canonical live-cutover.lock busy/unavailable"
log "flock_acquired lock=$WR_STAGING_MUTATION_LOCK_PATH"

# Live identity checks ONLY under the lock (re-validated immediately before stop).
if docker inspect "$KEEP_NAME" >/dev/null 2>&1; then
  die "keeper already exists: $KEEP_NAME"
fi
docker inspect "$NAME" >/dev/null || die "live container missing: $NAME"
CUR_IMG="$(docker inspect "$NAME" --format '{{.Image}}')"
log "current_image_id=$CUR_IMG"
if [[ "$REQUIRE_CURRENT_DIGEST" == "1" ]]; then
  [[ "$CUR_IMG" == "$RESOLVED_ID" ]] || die "live image id mismatch want=$RESOLVED_ID have=$CUR_IMG"
fi

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

# Fail-closed media promotion gate BEFORE declaring success / any manifest reconcile.
REPO_ROOT="${WOODRIGHT_REPO_ROOT:-}"
if [[ -z "$REPO_ROOT" ]]; then
  # Prefer installed ops copy next to this script when shipped under /srv/woodright/ops/release
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
log "running_media_gate gate=$GATE container=$NAME"
WOODRIGHT_BE_CONTAINER="$NAME" WOODRIGHT_MEDIA_VOLUME="$VOLUME" WOODRIGHT_MEDIA_MOUNT_IN_BE="$DEST" \
  bash "$GATE" --container "$NAME" ${WOODRIGHT_BUYER_HOST:+--buyer-host "$WOODRIGHT_BUYER_HOST"} \
  || die "MEDIA_PROMOTION_GATE_FAILED - refusing to declare recreate success (keeper=$KEEP_NAME)"

trap - ERR
PHASE=0
log "CREATED name=$NAME image=$IMAGE mount=${VOLUME}:${DEST} keeper=$KEEP_NAME media_gate=PASS"
log "NOTE: update ACTIVE_OWNER/EXPECTED_RELEASE only via ops/release/reconcile-runtime-manifests.sh"
