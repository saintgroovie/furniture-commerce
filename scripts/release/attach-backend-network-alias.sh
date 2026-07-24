#!/usr/bin/env bash
# EMERGENCY ONLY: attach public backend to the shared app network with alias
# `backend`. This is NOT durable across recreate and is NOT the source of truth.
# Canonical SoT: docker-compose.staging.yml backend.networks.woodright_staging.aliases.
#
# Prefer compose recreate after declarative alias is applied. Use this script
# only to restore media proxy briefly before rollback or compose fix.
#
# Requires: EMERGENCY_BACKEND_ALIAS=1
#
# Usage:
#   EMERGENCY_BACKEND_ALIAS=1 \
#   SHARED_NET=woodright-stack-3dsdhd_woodright_staging \
#   BACKEND_CONTAINER=woodright-staging-backend \
#   ./scripts/release/attach-backend-network-alias.sh
#
# Idempotent when alias already present. Disconnect/reconnect may briefly
# interrupt storefront→backend DNS; avoid on healthy declarative stacks.
set -euo pipefail

BACKEND_CONTAINER="${BACKEND_CONTAINER:-woodright-staging-backend}"
SHARED_NET="${SHARED_NET:-}"
ALIAS="${ALIAS:-backend}"

if [[ "${EMERGENCY_BACKEND_ALIAS:-}" != "1" ]]; then
  echo "refused: set EMERGENCY_BACKEND_ALIAS=1 to acknowledge non-durable emergency use" >&2
  echo "canonical fix: declarative aliases in docker-compose.staging.yml + recreate" >&2
  exit 2
fi

if [[ -z "$SHARED_NET" ]]; then
  echo "SHARED_NET is required (e.g. woodright-stack-3dsdhd_woodright_staging)" >&2
  exit 2
fi

if ! docker inspect "$BACKEND_CONTAINER" >/dev/null 2>&1; then
  echo "missing container: $BACKEND_CONTAINER" >&2
  exit 2
fi

# If already attached with alias, exit 0.
ALIASES="$(docker inspect -f "{{range \$k, \$v := .NetworkSettings.Networks}}{{if eq \$k \"$SHARED_NET\"}}{{json .Aliases}}{{end}}{{end}}" "$BACKEND_CONTAINER" 2>/dev/null || true)"
if printf '%s' "$ALIASES" | grep -q "\"$ALIAS\""; then
  echo "emergency_alias_present container=$BACKEND_CONTAINER net=$SHARED_NET alias=$ALIAS"
  exit 0
fi

docker network disconnect -f "$SHARED_NET" "$BACKEND_CONTAINER" 2>/dev/null || true
docker network connect --alias "$ALIAS" "$SHARED_NET" "$BACKEND_CONTAINER"
echo "emergency_alias_attached container=$BACKEND_CONTAINER net=$SHARED_NET alias=$ALIAS note=non_durable"
