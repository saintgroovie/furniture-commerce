# Staging mutation lock

Canonical exclusive lock for all staging runtime/data mutators:

`/srv/woodright/locks/live-cutover.lock`

Shared helper: `ops/lib/woodright-staging-mutation-lock.sh`

## Must acquire before mutation

- `ops/release/recreate-staging-backend-with-media.sh`
- `ops/release/reconcile-runtime-manifests.sh --apply`
- `ops/release/run-staging-seed-rooms-v1.sh`
- `scripts/release/attach-backend-network-alias.sh` (when attaching)
- `scripts/release/reconcile-public-image-pins.sh`

## Forbidden

- Ad-hoc `docker rename/stop/create` on `woodright-staging-*` without the lock
- Ad-hoc `docker run … seed-rooms-v1` apply against staging (use `run-staging-seed-rooms-v1.sh`)
- Treating `/srv/woodright/runtime-ownership/DEPLOY.lock` as the authoritative mutex

## Known limitation

Dokploy UI/API cannot natively hold flock. Operators must not run parallel manual mutators during Dokploy-owned cutovers. Parallel agent cutovers are a governance failure, not a Docker feature.

## Seedharden incident note

2026-07-28 competing agent swapped live pair to `9ffb3189` while official recreate used `DEPLOY.lock` only. Fixed by unifying on `live-cutover.lock`.

## DB migrate

- Host: `WOODRIGHT_MIGRATE_AUTHORIZED=1 ops/release/run-staging-db-migrate.sh`
- In-image `apps/backend/scripts/migrate-only.sh` refuses unless `WOODRIGHT_CUTOVER_LOCK_OK=1`
