#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Host-side staging DB migrate under canonical live-cutover.lock (flock).
# Runs medusa db:migrate inside the live staging backend container with
# WOODRIGHT_CUTOVER_LOCK_OK=1 proof. Does not restart buyer containers.
#
# Usage:
#   WOODRIGHT_MIGRATE_AUTHORIZED=1 ops/release/run-staging-db-migrate.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$ROOT/ops/lib/woodright-staging-mutation-lock.sh"

NAME="${WOODRIGHT_BE_CONTAINER:-woodright-staging-backend}"
TARGET="${WOODRIGHT_MIGRATE_TARGET:-staging}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$TARGET" == "staging" ]] || die "refused: WOODRIGHT_MIGRATE_TARGET must be staging"
[[ "${WOODRIGHT_MIGRATE_AUTHORIZED:-}" == "1" ]] || \
  die "refused: set WOODRIGHT_MIGRATE_AUTHORIZED=1 after explicit owner approval"
[[ "$NAME" == woodright-staging-* ]] || die "refused: container must be woodright-staging-* (got $NAME)"
docker inspect "$NAME" >/dev/null || die "missing container $NAME"

wr_staging_mutation_lock_acquire \
  "actor=run-staging-db-migrate" \
  "command=$0" \
  "target=$NAME" \
  || die "canonical live-cutover.lock busy/unavailable"

# Re-validate under lock, then migrate in-place (no recreate).
docker inspect "$NAME" >/dev/null || die "container disappeared under lock"
docker exec -e WOODRIGHT_CUTOVER_LOCK_OK=1 "$NAME" \
  ./node_modules/.bin/medusa db:migrate

printf 'run-staging-db-migrate: done container=%s\n' "$NAME"
