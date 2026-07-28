#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Governance wrapper for RoomSet V1 owner-approved seed against staging.
# Prevents ad-hoc `docker run … seed-rooms-v1` bypass of the canonical cutover lock
# (seedharden incident 2026-07-28). Uses flock on /srv/woodright/locks/live-cutover.lock.
#
# Usage:
#   ROOMSET_SEED_MODE=dry-run ops/release/run-staging-seed-rooms-v1.sh
#   ROOMSET_SEED_MODE=apply WOODRIGHT_SEED_APPLY_AUTHORIZED=1 \
#     ops/release/run-staging-seed-rooms-v1.sh
#
# dry-run: takes lock (serializes against cutover) but does not require apply auth.
# apply: requires WOODRIGHT_SEED_APPLY_AUTHORIZED=1 AND canonical lock.
#
# Does NOT target production. Refuses woodright.ru / production container names.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$ROOT/ops/lib/woodright-staging-mutation-lock.sh"

MODE="${ROOMSET_SEED_MODE:-dry-run}"
TARGET="${ROOMSET_SEED_TARGET:-staging}"
SCOPE="${ROOMSET_SEED_SCOPE:-rooms-v1-owner-approved}"
IMAGE="${WOODRIGHT_SEED_IMAGE:?set WOODRIGHT_SEED_IMAGE to exact digest ref ghcr.io/...@sha256:...}"
ENV_FILE="${WOODRIGHT_SEED_ENV_FILE:?set WOODRIGHT_SEED_ENV_FILE (mode 600)}"
NET="${WOODRIGHT_SEED_NETWORK:-dokploy-network}"
SCRIPT_PATH="${WOODRIGHT_SEED_SCRIPT:-./src/scripts/seed-rooms-v1-owner-approved.js}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$MODE" == "dry-run" || "$MODE" == "apply" ]] || die "ROOMSET_SEED_MODE must be dry-run|apply"
[[ "$TARGET" == "staging" ]] || die "refused: ROOMSET_SEED_TARGET must be staging (got $TARGET)"
case "$IMAGE" in
  *production*|*woodright.ru*) die "refused: production image/target" ;;
esac
if [[ "$MODE" == "apply" ]]; then
  [[ "${WOODRIGHT_SEED_APPLY_AUTHORIZED:-}" == "1" ]] || \
    die "apply refused: set WOODRIGHT_SEED_APPLY_AUTHORIZED=1 after explicit owner approval"
fi

# Acquire BEFORE env/image mutation-side validation so contention fails closed on the lock.
wr_staging_mutation_lock_acquire \
  "actor=run-staging-seed-rooms-v1" \
  "command=$0 mode=$MODE" \
  "target=$IMAGE" \
  || die "canonical live-cutover.lock busy/unavailable"

[[ -f "$ENV_FILE" ]] || die "missing env file"
ENV_MODE="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")"
[[ "$ENV_MODE" == "600" || "$ENV_MODE" == "0600" ]] || die "ENV_FILE mode must be 600"

# Ephemeral exec container only — never rename/replace woodright-staging-* live names.
docker run --rm \
  --network "$NET" \
  --env-file "$ENV_FILE" \
  -e "ROOMSET_SEED_TARGET=$TARGET" \
  -e "ROOMSET_SEED_SCOPE=$SCOPE" \
  -e "ROOMSET_SEED_MODE=$MODE" \
  --entrypoint ./node_modules/.bin/medusa \
  "$IMAGE" \
  exec "$SCRIPT_PATH"

printf 'run-staging-seed-rooms-v1: done mode=%s target=%s\n' "$MODE" "$TARGET"
