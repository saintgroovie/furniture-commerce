# Production-candidate rollback (private stack)

Audience: operators restoring the **private** Woodright production-candidate
(`woodright-production`, binds `127.0.0.1:9200` / `127.0.0.1:3200`).

This is **not** public-demo rollback and **not** a `woodright.ru` DNS procedure.

## Scope: image rollback is automatic, DB rollback is this document

`ops/release/cutover-production-candidate.sh --mode execute` now performs the
image pair cutover itself and **rolls itself back** on any failure after the
first pin write - including on `SIGINT` / `SIGTERM` / `SIGHUP`. It restores the
backed-up compose `.env` pins and the renamed keeper containers under the same
lock, then exits `10` with state `rolled_back`. `ACTIVE_OWNER` /
`EXPECTED_RELEASE` / `ACTIVE_RELEASE` are written **only** after health and the
loopback HTTP gates pass, so a rolled-back attempt never publishes a release.

Consequences for the manual procedure below:

- The helper takes the production-scoped lock
  `/srv/woodright/locks/production/live-cutover.lock` (from
  `ops/config/runtime-environments/production.conf`), not the generic one named
  in Phase A. Do not run both at once.
- Keeper containers **do** exist for an automated cutover
  (`woodright-production-<component>-keeper-<UTC>`), and the helper restores
  them on failure. They are still not a durable anchor: for a later manual
  rollback use the recorded digests, as described below.
- The evidence directory of the failed run
  (`.../private-pair-cutover-<UTC>/`) holds `state.txt`,
  `state-transitions.log`, the pin backup and the pre/post inspect snapshots.
  Read it before starting any manual step.
- The application release SHA (`application_source_sha`, the OCI revision of
  the images) and the helper install SHA (`helper_install_sha`, the ops commit
  that installed the script) are recorded as separate fields. When restoring,
  anchor on the application SHA - never on the helper SHA.

Use the phases below when the image-level rollback is not enough: database
damage, a partially applied migration, or a failure discovered after the
cutover already committed.

## Anchors (digest, not tag)

Prefer exact OCI digests recorded at cutover time. Example prior foreign anchors
(replace with the cycle's recorded values):

- Backend: `ghcr.io/saintgroovie/woodright-backend@sha256:<prev>`
- Storefront: `ghcr.io/saintgroovie/woodright-storefront@sha256:<prev>`

### Keeper containers vs image anchors

- **Do not assume** stopped `*-keeper-*` containers exist for production.
- Compose `--force-recreate` may consume renamed keepers.
- Rollback uses **immutable image digests** (local `docker image inspect` and/or GHCR pull) plus backed-up compose `.env` / `docker-compose.yml`.
- Staging may still have unrelated keeper containers - never use those for production.

## Phase A - incident + lock

1. Record incident reason + UTC timestamp.
2. Acquire `/srv/woodright/locks/live-cutover.lock` via
   `ops/lib/woodright-staging-mutation-lock.sh` (covers live production mutations).
3. Confirm target containers: `woodright-production-backend`,
   `woodright-production-storefront`, DB `woodright_production`.
4. Refuse parallel deploy / migrate / backup actors.

## Phase B - quiesce writers

1. Identify writers against `woodright_production`:
   - `woodright-production-backend`
   - any one-shot migrate/exec containers
   - operator interactive `psql` / `medusa exec`
2. Stop backend (and storefront if it may write) with compose:
   `cd /etc/dokploy/compose/woodright-production/code && docker compose --env-file .env stop backend storefront`
3. Terminate non-operator sessions and confirm **zero** unexpected connections:

```sh
docker exec woodright-production-postgres psql -U woodright_production -d postgres -v ON_ERROR_STOP=1 -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'woodright_production'
  AND pid <> pg_backend_pid();
"
docker exec woodright-production-postgres psql -U woodright_production -d postgres -Atc "
SELECT count(*) FROM pg_stat_activity
WHERE datname='woodright_production' AND pid <> pg_backend_pid();
"
# must print 0 before continuing
```

4. Record quiesce UTC timestamp.

## Phase C - preserve failed state

If DB still reachable, take an incident dump (`-Fc`) + checksum before overwrite.
Save: migration ledger, container inspect, pins/digests, recent logs (redacted).

## Phase D - restore target DB

**Never** restore into staging/demo DB. Confirm target identity explicitly.

**Do not** rely on in-place `pg_restore --clean --if-exists` against a long-lived
production DB as the sole strategy: objects created after the dump TOC can survive
and create a hybrid schema.

Required clean strategy (pick one, document which):

1. **Preferred:** create replacement DB `woodright_production_restore_<UTC>`, restore into it with
   `pg_restore --exit-on-error --no-owner` (and `--single-transaction` when dump format allows),
   verify (Phase E), then swap by renaming DBs under quiesce
   (old → `_failed_<UTC>`, new → `woodright_production`).
2. **Alternate:** `DROP DATABASE woodright_production` (after terminate) →
   `CREATE DATABASE woodright_production` → restore into empty DB with `--exit-on-error`.
   Abort and recover from the Phase C incident dump if restore fails mid-way.

Example restore into an empty/replacement DB:

```sh
docker cp /path/to/woodright_production.dump woodright-production-postgres:/tmp/restore.dump
docker exec woodright-production-postgres \
  pg_restore -U woodright_production -d woodright_production_restore_<UTC> \
  --exit-on-error --no-owner --no-acl -Fc /tmp/restore.dump
```

If restoring an older dump that lacks later Medusa migrations required by the target image,
re-run `medusa db:migrate --skip-scripts` from the **target** image after restore and before resume.

## Phase E - verify restored DB (before writers)

- restore exit code 0
- `pg_restore -l` / object counts
- `mikro_orm_migrations` includes required release migrations
- required tables/indexes (sales policy, order process/access, tax-line `data` columns when on post-7628056d schema)
- representative product/order counts (counts only - no PII)
- DB name identity; application role can connect

## Phase F - restore images/config

1. Restore backed-up compose `.env` + `docker-compose.yml` (exact previous SHA + digests).
2. `docker image inspect` / GHCR manifest for previous digests.
3. No mutable tags as authority.

## Phase G - controlled resume

1. Start backend first; wait healthy.
2. Confirm migrations do not unexpectedly re-apply destructive changes.
3. Start storefront; wait healthy.
4. Resume workers/jobs if any.
5. Smoke localhost `:9200` / `:3200`.
6. Release lock only after stability.

## Phase H - post-restore verification

Two HTTP rounds: health, release headers, catalog, Rooms, cart, track, Admin shell, media.
Confirm staging/public-demo unchanged. No DNS / `woodright.ru` changes in this procedure.
