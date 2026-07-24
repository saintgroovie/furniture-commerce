#!/usr/bin/env bash
# Fail-closed guard before any ACTIVE_OWNER / EXPECTED_RELEASE update for backend.
# Read-only. Does not write manifests. Operators must call this before reconcile.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$ROOT/ops/release/verify-backend-media-mount.sh"

BUYER_HOST="${WOODRIGHT_BUYER_HOST:-https://woodright-demo.ru}"

echo "assert-manifest-update-allowed: running media promotion gate…" >&2
"$GATE" --compose-only --compose-file "${WOODRIGHT_COMPOSE_FILE:-$ROOT/docker-compose.staging.yml}"
"$GATE" --buyer-host "$BUYER_HOST" ${WOODRIGHT_BE_CONTAINER:+--container "$WOODRIGHT_BE_CONTAINER"}
echo "assert-manifest-update-allowed: PASS (safe to reconcile manifests)" >&2
