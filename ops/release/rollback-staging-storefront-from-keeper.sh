#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# Restore woodright-staging-storefront from a renamed keeper under canonical lock.
# Canonical lock path: /srv/woodright/locks/live-cutover.lock
# Nested under pair orchestrator via inherited flock FD (woodright-staging-mutation-lock.sh).
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"

KEEP_NAME=""
EVIDENCE_DIR=""
FAILED_SUFFIX=""

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 2; }

FULL_ARGV=("$@")
wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
[[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] || die "only --environment public_demo"

set -- "${FULL_ARGV[@]}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) shift 2 ;;
    --environment=*) shift ;;
    --keep-name) KEEP_NAME="${2:?}"; shift 2 ;;
    --keep-name=*) KEEP_NAME="${1#--keep-name=}"; shift ;;
    --evidence-dir) EVIDENCE_DIR="${2:?}"; shift 2 ;;
    --evidence-dir=*) EVIDENCE_DIR="${1#--evidence-dir=}"; shift ;;
    *) shift ;;
  esac
done

NAME="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
NET_STACK="${WOODRIGHT_NET_STACK}"
NET_DOKPLOY="${WOODRIGHT_NET_DOKPLOY:-dokploy-network}"
[[ -n "$KEEP_NAME" ]] || die "missing --keep-name"
case "$KEEP_NAME" in
  woodright-staging-storefront-keeper-*|woodright-staging-storefront-rollback-*) ;;
  *) die "KEEP_NAME must be a staging storefront keeper/rollback name" ;;
esac
wr_cutover_refuse_production_name "$NAME" || exit 2
wr_cutover_refuse_production_name "$KEEP_NAME" || exit 2

wr_staging_mutation_lock_acquire \
  "actor=rollback-staging-storefront-from-keeper" \
  "command=$0" \
  "target=$KEEP_NAME" \
  || die "lock busy"

wr_cutover_docker inspect "$KEEP_NAME" >/dev/null || die "keeper missing: $KEEP_NAME"

# Capture keeper identity before rename (authoritative restore target)
KEEP_DIGEST_BLOB="$(wr_cutover_docker inspect "$KEEP_NAME" --format '{{json .RepoDigests}}{{.Config.Image}}{{.Image}}')"
KEEP_SHA="$(wr_cutover_docker inspect "$KEEP_NAME" --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
KEEP_ROLE="$(wr_cutover_docker inspect "$KEEP_NAME" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
[[ "$KEEP_ROLE" == "public_demo" ]] || die "keeper runtime-role must be public_demo (got '${KEEP_ROLE:-empty}')"
# release-sha may be absent on legacy keepers; digest identity remains mandatory.

if wr_cutover_docker inspect "$NAME" >/dev/null 2>&1; then
  FAILED_SUFFIX="failed-$(date -u +%Y%m%dT%H%M%SZ)"
  wr_cutover_docker stop "$NAME" || true
  wr_cutover_docker rename "$NAME" "${NAME}-${FAILED_SUFFIX}"
  log "moved_failed_live_to ${NAME}-${FAILED_SUFFIX}"
fi

wr_cutover_docker rename "$KEEP_NAME" "$NAME"
wr_cutover_docker network connect "$NET_STACK" "$NAME" 2>/dev/null || true
wr_cutover_docker network connect "$NET_DOKPLOY" "$NAME" 2>/dev/null || true
wr_cutover_docker start "$NAME"

for _ in 1 2 3 4 5 6; do
  st="$(wr_cutover_docker inspect "$NAME" --format '{{.State.Status}}')"
  [[ "$st" == "running" ]] && break
  sleep 2
done
st="$(wr_cutover_docker inspect "$NAME" --format '{{.State.Status}}')"
[[ "$st" == "running" ]] || die "storefront not running after rollback"

# Fail-closed: restored live must match keeper digest identity + release-sha
LIVE_DIGEST_BLOB="$(wr_cutover_docker inspect "$NAME" --format '{{json .RepoDigests}}{{.Config.Image}}{{.Image}}')"
LIVE_SHA="$(wr_cutover_docker inspect "$NAME" --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
LIVE_ROLE="$(wr_cutover_docker inspect "$NAME" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
[[ "$LIVE_DIGEST_BLOB" == "$KEEP_DIGEST_BLOB" ]] || die "storefront digest identity mismatch after rollback"
[[ "$LIVE_ROLE" == "public_demo" ]] || die "storefront runtime-role mismatch after rollback"
if [[ -n "$KEEP_SHA" && "$KEEP_SHA" != "<no value>" ]]; then
  [[ "$LIVE_SHA" == "$KEEP_SHA" ]] || die "storefront release-sha mismatch after rollback (want $KEEP_SHA got ${LIVE_SHA:-empty})"
fi

if [[ -n "$EVIDENCE_DIR" ]]; then
  mkdir -p "$EVIDENCE_DIR/json"
  printf '{"restored_from_keeper":"%s","live":"%s","failed_suffix":"%s","release_sha":"%s","identity_verified":true}\n' \
    "$KEEP_NAME" "$NAME" "$FAILED_SUFFIX" "${KEEP_SHA:-}" >"$EVIDENCE_DIR/json/storefront-rollback-result.json"
fi
log "ROLLBACK_OK storefront from_keeper=$KEEP_NAME sha=${KEEP_SHA:-none}"
