#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# Restore woodright-staging-backend from a renamed keeper under canonical lock.
# Canonical lock path: /srv/woodright/locks/live-cutover.lock
# In-repo keeper rollback (pair cutover + backend recreate recover path).
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

NAME="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
NET_STACK="${WOODRIGHT_NET_STACK}"
NET_DOKPLOY="${WOODRIGHT_NET_DOKPLOY:-dokploy-network}"
VOLUME="${WOODRIGHT_MEDIA_VOLUME}"
[[ -n "$KEEP_NAME" ]] || die "missing --keep-name"
case "$KEEP_NAME" in
  woodright-staging-backend-keeper-*|woodright-staging-backend-rollback-*) ;;
  *) die "KEEP_NAME must be a staging backend keeper/rollback name" ;;
esac
wr_cutover_refuse_production_name "$NAME" || exit 2
wr_cutover_refuse_production_name "$KEEP_NAME" || exit 2

wr_staging_mutation_lock_acquire \
  "actor=rollback-staging-backend-from-keeper" \
  "command=$0" \
  "target=$KEEP_NAME" \
  || die "lock busy"

wr_cutover_docker inspect "$KEEP_NAME" >/dev/null || die "keeper missing: $KEEP_NAME"

# Capture keeper identity before rename via image inspect (never container .RepoDigests).
KEEP_DIGEST="$(wr_cutover_container_immutable_digest "$KEEP_NAME" backend)" || die "keeper digest resolve failed"
KEEP_SHA="$(wr_cutover_docker inspect "$KEEP_NAME" --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
KEEP_ROLE="$(wr_cutover_docker inspect "$KEEP_NAME" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
[[ "$KEEP_ROLE" == "public_demo" ]] || die "keeper runtime-role must be public_demo (got '${KEEP_ROLE:-empty}')"
# release-sha may be absent on legacy backend keepers; digest identity remains mandatory.

if wr_cutover_docker inspect "$NAME" >/dev/null 2>&1; then
  FAILED_SUFFIX="failed-$(date -u +%Y%m%dT%H%M%SZ)"
  wr_cutover_docker stop "$NAME" || true
  wr_cutover_docker rename "$NAME" "${NAME}-${FAILED_SUFFIX}"
  log "moved_failed_live_to ${NAME}-${FAILED_SUFFIX}"
fi

wr_cutover_docker rename "$KEEP_NAME" "$NAME"
wr_cutover_docker network connect "$NET_STACK" "$NAME" 2>/dev/null || true
wr_cutover_docker network connect "$NET_DOKPLOY" "$NAME" 2>/dev/null || true
if [[ -n "${VOLUME:-}" ]]; then
  mounts="$(wr_cutover_docker inspect "$NAME" --format '{{json .Mounts}}')"
  echo "$mounts" | grep -q "$VOLUME" || log "WARN media volume not visible on restored backend"
fi
wr_cutover_docker start "$NAME"

st=""
# Short waits for fidelity harness; production rollback still loops enough for health
_RB_SLEEP="${WOODRIGHT_ROLLBACK_POLL_SLEEP_SEC:-5}"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  st="$(wr_cutover_docker inspect "$NAME" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')"
  [[ "$st" == "healthy" ]] && break
  [[ "$st" == "exited" ]] && die "backend exited during rollback"
  sleep "$_RB_SLEEP"
done
# Prefer healthy; if no Health block, allow running only when Health is absent
has_health="$(wr_cutover_docker inspect "$NAME" --format '{{if .State.Health}}yes{{else}}no{{end}}')"
if [[ "$has_health" == "yes" ]]; then
  [[ "$st" == "healthy" ]] || die "backend not healthy after rollback (status=$st)"
else
  [[ "$st" == "running" ]] || die "backend not running after rollback (status=$st)"
fi

# Fail-closed: restored live must match keeper digest identity + release-sha
LIVE_DIGEST="$(wr_cutover_container_immutable_digest "$NAME" backend)" || die "restored digest resolve failed"
LIVE_SHA="$(wr_cutover_docker inspect "$NAME" --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
LIVE_ROLE="$(wr_cutover_docker inspect "$NAME" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
[[ "$LIVE_DIGEST" == "$KEEP_DIGEST" ]] || die "backend digest identity mismatch after rollback (have=$LIVE_DIGEST want=$KEEP_DIGEST)"
[[ "$LIVE_ROLE" == "public_demo" ]] || die "backend runtime-role mismatch after rollback"
if [[ -n "$KEEP_SHA" && "$KEEP_SHA" != "<no value>" ]]; then
  [[ "$LIVE_SHA" == "$KEEP_SHA" ]] || die "backend release-sha mismatch after rollback (want $KEEP_SHA got ${LIVE_SHA:-empty})"
fi

if [[ -n "$EVIDENCE_DIR" ]]; then
  mkdir -p "$EVIDENCE_DIR/json"
  printf '{"restored_from_keeper":"%s","live":"%s","failed_suffix":"%s","release_sha":"%s","repo_digest":"%s","identity_verified":true}\n' \
    "$KEEP_NAME" "$NAME" "$FAILED_SUFFIX" "${KEEP_SHA:-}" "$KEEP_DIGEST" >"$EVIDENCE_DIR/json/backend-rollback-result.json"
fi
log "ROLLBACK_OK backend from_keeper=$KEEP_NAME sha=${KEEP_SHA:-none} digest=$KEEP_DIGEST"
