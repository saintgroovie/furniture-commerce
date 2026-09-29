# Targeted promotion_slot migration

`medusa db:migrate` loads every module and calls `migrations.run()` with no name filter. The live database still has an unapplied tail. `Migration20250505101505` drops and recreates the primary key of `workflow_execution`. Do not run it to create `promotion_slot`.

This helper applies only `Migration20260908120000`.

It uses the Medusa `Migrations.run` wrapper shipped in the production backend image. That wrapper calls MikroORM `migrator.up({ migrations: ["Migration20260908120000"] })` with `transactional: true` and `allOrNothing: true`. The only migration directory loaded is `/server/src/modules/promotion-slot/migrations`. Bookkeeping is the framework row in `mikro_orm_migrations`, written in that same migration transaction.

Execute holds `/srv/woodright/locks/public_production/live-cutover.lock` through `ops/lib/woodright-staging-mutation-lock.sh`. An inherited lock from another environment is cleared. After the lock is held, the helper checks the lock file descriptor, pins the postgres container id and backend image id, and checks the database, bookkeeping, and image again. The framework runs in a named container. Interrupt and exit keep the lock until Docker confirms that container has exited and been removed. Absence counts only when Docker reports that the container does not exist. Any other Docker error keeps the lock. Dry-run does not take the lock and does not open a migration connection.

The runner and lock helper paths are the copies next to this script. Caller environment variables cannot replace them. The helper has no down or revert mode.

## Preconditions

- Environment argument is `public_production`.
- Database name inside the named container is `woodright_public_production`.
- Application SHA is `23019df5c2d3cb9b47f0e9b780e8efef8b40a440`, and the backend image label matches it.
- Migration file SHA-256 is `e5e3ecdfa91af6680f848585c94e93599d9cd7d6f6671ff4b2bc90d0d2f0fdb1`.
- Governance marker `/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt` equals `--governance-sha`.
- Backup manifest is schema `woodright_recovery_point_v2`, kind `woodright_recovery_point`, status `success`, `partial` false, verification status `verified`, `pending_rehearsal`, or `unverified`, environment `public_production`, database `woodright_public_production`, a 40-hex `application_sha`, a 64-hex `db.sha256`, and `created_at_utc` within 72 hours. On a real run the dump file at `db.path` must be a regular file and match that checksum. The manifest `application_sha` is the storefront image label recorded by the backup helper. The runner still pins the backend image to `23019df5c2d3cb9b47f0e9b780e8efef8b40a440`.
- `promotion_slot` is absent and `Migration20260908120000` is absent from `mikro_orm_migrations`.
- Rehearsal container name is exactly `woodright-rehearsal-promotion-slot`.
- Live container name is exactly `woodright-public-production-postgres`.

The connection string is built from that container and attached with `docker run --network container:<that-container>`. The migrator uses `127.0.0.1` inside that network namespace. A caller cannot pass a database URL.

## Dry-run

```sh
bash ops/release/woodright-targeted-migration.sh \
  --environment public_production \
  --migration Migration20260908120000 \
  --runtime-scope rehearsal \
  --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha 23019df5c2d3cb9b47f0e9b780e8efef8b40a440 \
  --governance-sha <installed-governance-sha> \
  --backup-manifest <recovery-point.json> \
  --backend-image <production-backend-image> \
  --mode dry-run
```

Expected stdout: `DRY_RUN_OK migration=Migration20260908120000`.

## Rehearsal execute

Same arguments, plus:

```sh
  --mode execute \
  --confirm I_UNDERSTAND_REHEARSAL_TARGETED_MIGRATION
```

Expected stdout includes `{"mode":"executed","names":["Migration20260908120000"]}` and `EXECUTE_OK migration=Migration20260908120000`.

## Live execute

Do not run this until a separate owner approval exists for live apply. The confirmation is `I_UNDERSTAND_LIVE_PUBLIC_PRODUCTION_TARGETED_MIGRATION` and the container is `woodright-public-production-postgres`. Rehearsal confirmation does not authorize live.

## Refusals

- `ALREADY_APPLIED` when the bookkeeping row and `promotion_slot` both exist. The helper does not run the migration again.
- `BOOKKEEPING_WITHOUT_TABLE` when the bookkeeping row exists and the table does not. That is not a healthy applied state.
- `partial promotion_slot exists without migration bookkeeping` when the table exists and the row does not. The helper does not repair it.
- Any migration name other than `Migration20260908120000`, including `Migration20250505101505`.
- Wrong environment, database, application SHA, governance marker, container, or backup manifest.

## Read-only checks after execute

```sql
SELECT COALESCE(to_regclass('public.promotion_slot')::text, 'absent');
SELECT name FROM mikro_orm_migrations
 WHERE name IN ('Migration20260908120000', 'Migration20250505101505');
SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.workflow_execution'::regclass AND contype = 'p';
SELECT COUNT(*) FROM promotion_slot;
```

Expected: table present, only `Migration20260908120000` among those two names, primary key still `(workflow_id, transaction_id, run_id)`, zero promotion rows.

## Rollback

Preferred live rollback is restore of the pre-migration `public_production` recovery point. The migration class `down()` is `DROP TABLE IF EXISTS promotion_slot CASCADE`. This helper does not call it.

## Cleanup

Remove only the disposable rehearsal containers, network, and temporary runner copies created for the rehearsal. Do not delete recovery points.
