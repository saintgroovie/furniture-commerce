#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# Canonical lock: /srv/woodright/locks/public_demo/live-cutover.lock
# Exclusive flock via wr_staging_mutation_lock_acquire (nested inherit supported).
# Governed public_demo Traefik file-provider endpoint authority.
# Pins eligible demo service URLs to verified dokploy-network IPs of the live
# public_demo pair, or restores hostname URLs after rollback.
# Does not recreate application containers, change DNS, apex, or production.
set -euo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"

WR_TF_EP_TOKEN='I_UNDERSTAND_PUBLIC_DEMO_TRAEFIK_ENDPOINT'
MODE=""
CONFIRM=""
SF_SHA=""
SF_DIGEST=""
SF_ID=""
BE_SHA=""
BE_DIGEST=""
BE_ID=""

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 2; }

usage() {
  cat <<'EOF'
Governed public_demo Traefik endpoint helper.

Usage:
  apply-public-demo-traefik-endpoints.sh --environment public_demo \
    --mode dry-run|execute|restore-hostnames \
    [--confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_TRAEFIK_ENDPOINT] \
    [--sf-sha 40hex --sf-digest sha256:... --be-sha 40hex --be-digest sha256:...] \
    [--sf-id <id> --be-id <id>]

Modes:
  dry-run            Discover live IPs and print planned URLs. No write.
  execute            CAS-write verified dokploy-network IPs into demo YAML.
  restore-hostnames  Restore woodright-staging-* hostname URLs.

Does not start caf82b0, change DNS, apex, candidate, or public production.
EOF
}

for _arg in "$@"; do
  case "$_arg" in
    -h|--help) usage; exit 0 ;;
  esac
done

FULL_ARGV=("$@")
wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
[[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] || die "only --environment public_demo"

set -- "${FULL_ARGV[@]}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) shift 2 ;;
    --environment=*) shift ;;
    --mode) MODE="${2:?}"; shift 2 ;;
    --mode=*) MODE="${1#--mode=}"; shift ;;
    --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
    --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
    --sf-sha) SF_SHA="${2:?}"; shift 2 ;;
    --sf-sha=*) SF_SHA="${1#--sf-sha=}"; shift ;;
    --sf-digest) SF_DIGEST="${2:?}"; shift 2 ;;
    --sf-digest=*) SF_DIGEST="${1#--sf-digest=}"; shift ;;
    --be-sha) BE_SHA="${2:?}"; shift 2 ;;
    --be-sha=*) BE_SHA="${1#--be-sha=}"; shift ;;
    --be-digest) BE_DIGEST="${2:?}"; shift 2 ;;
    --be-digest=*) BE_DIGEST="${1#--be-digest=}"; shift ;;
    --sf-id) SF_ID="${2:?}"; shift 2 ;;
    --sf-id=*) SF_ID="${1#--sf-id=}"; shift ;;
    --be-id) BE_ID="${2:?}"; shift 2 ;;
    --be-id=*) BE_ID="${1#--be-id=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg $1" ;;
  esac
done

[[ -n "$MODE" ]] || die "missing --mode"
case "$MODE" in
  dry-run|execute|restore-hostnames) ;;
  *) die "invalid mode=$MODE" ;;
esac

if [[ "$MODE" != "dry-run" ]]; then
  wr_staging_mutation_lock_acquire \
    "actor=apply-public-demo-traefik-endpoints" \
    "command=$0" \
    "mode=$MODE" \
    || die "lock busy"
fi

SF_NAME="${WOODRIGHT_SF_CONTAINER_DEFAULT:-woodright-staging-storefront}"
BE_NAME="${WOODRIGHT_BE_CONTAINER_DEFAULT:-woodright-staging-backend}"

if [[ "$MODE" == "restore-hostnames" ]]; then
  if [[ "$CONFIRM" != "$WR_TF_EP_TOKEN" ]]; then
    die "restore-hostnames requires --confirm-mutation ${WR_TF_EP_TOKEN}"
  fi
  WOODRIGHT_PUBLIC_DEMO_RESTORE_ENDPOINTS=1
  wr_public_demo_restore_traefik_hostnames || die "hostname restore failed"
  log "TRAEFIK_ENDPOINT_HOSTNAMES_RESTORED"
  exit 0
fi

if [[ -z "$SF_SHA" ]]; then
  SF_SHA="$(wr_cutover_docker inspect "$SF_NAME" --format '{{index .Config.Labels "com.woodright.release-sha"}}' | tr '[:upper:]' '[:lower:]')"
fi
if [[ -z "$BE_SHA" ]]; then
  BE_SHA="$(wr_cutover_docker inspect "$BE_NAME" --format '{{index .Config.Labels "com.woodright.release-sha"}}' | tr '[:upper:]' '[:lower:]')"
fi
if [[ -z "$SF_DIGEST" ]]; then
  SF_DIGEST="$(wr_cutover_container_immutable_digest "$SF_NAME" storefront)" || die "storefront digest resolve failed"
fi
if [[ -z "$BE_DIGEST" ]]; then
  BE_DIGEST="$(wr_cutover_container_immutable_digest "$BE_NAME" backend)" || die "backend digest resolve failed"
fi
if [[ -z "$SF_ID" ]]; then
  SF_ID="$(wr_cutover_docker inspect "$SF_NAME" --format '{{.Id}}')"
fi
if [[ -z "$BE_ID" ]]; then
  BE_ID="$(wr_cutover_docker inspect "$BE_NAME" --format '{{.Id}}')"
fi

sf_ip="$(wr_public_demo_container_dokploy_ip "$SF_NAME" "$SF_SHA" "$SF_DIGEST" "$SF_ID" storefront)" || die "storefront IP discovery failed"
be_ip="$(wr_public_demo_container_dokploy_ip "$BE_NAME" "$BE_SHA" "$BE_DIGEST" "$BE_ID" backend)" || die "backend IP discovery failed"
sf_url="http://${sf_ip}:3002"
be_url="http://${be_ip}:9000"
log "PLANNED sf=$sf_url be=$be_url sha=$SF_SHA file=$(wr_public_demo_resolver_file)"

if [[ "$MODE" == "dry-run" ]]; then
  log "DRY_RUN no write"
  exit 0
fi

[[ "$CONFIRM" == "$WR_TF_EP_TOKEN" ]] || die "execute requires --confirm-mutation ${WR_TF_EP_TOKEN}"
wr_public_demo_apply_traefik_pair_endpoints \
  "$SF_NAME" "$SF_SHA" "$SF_DIGEST" "$SF_ID" \
  "$BE_NAME" "$BE_SHA" "$BE_DIGEST" "$BE_ID" \
  || die "endpoint rewrite failed"
log "TRAEFIK_ENDPOINT_APPLIED sf=$sf_url be=$be_url"
exit 0
