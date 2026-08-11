#!/bin/sh
# LIVE_MUTATING=true
# requires_global_lock=true
#
# In-image Medusa migration entrypoint (no seed).
# Host must hold /srv/woodright/locks/live-cutover.lock and inject
# WOODRIGHT_CUTOVER_LOCK_OK=1 before invoking this script against a live DB.
#
# Prefer: ops/release/run-staging-db-migrate.sh (host flock on live-cutover.lock)
set -eu

if [ "${WOODRIGHT_CUTOVER_LOCK_OK:-}" != "1" ]; then
  echo "refused: migrate-only requires host-held live-cutover.lock (set WOODRIGHT_CUTOVER_LOCK_OK=1 via ops/release/run-staging-db-migrate.sh)" >&2
  exit 3
fi

echo "Running Medusa migrations (no seed) under cutover lock proof..."
exec ./node_modules/.bin/medusa db:migrate
