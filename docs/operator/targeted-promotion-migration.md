# Targeted promotion_slot migration

`medusa db:migrate` runs every loaded module. That includes an unapplied tail. `Migration20250505101505` drops and recreates the primary key of live `workflow_execution`.

This helper applies only `Migration20260908120000`.

It uses the Medusa `Migrations.run` wrapper shipped in the backend image. That wrapper calls MikroORM `migrator.up({ migrations: ["Migration20260908120000"] })`. The connection path is only `promotion-slot/migrations`. Bookkeeping is the framework row in `mikro_orm_migrations`, in the same transaction as the SQL.

## Command

Dry-run:

```sh
bash ops/release/woodright-targeted-migration.sh \
  --environment public_production \
  --migration Migration20260908120000 \
  --runtime-scope rehearsal \
  --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha 931140158756b921100e4f97cf1f27cd3ba61bc2 \
  --governance-sha <installed-governance-sha> \
  --backup-manifest <recovery-point.json> \
  --backend-image <production-backend-image> \
  --mode dry-run
```

The execute connection is built from the named Postgres container and attached with `docker run --network container:<that-container>`. The migrator uses `127.0.0.1` inside that network namespace. A caller-supplied database URL cannot redirect the migration to another server.

Live production execute is a separate confirmation, `I_UNDERSTAND_LIVE_PUBLIC_PRODUCTION_TARGETED_MIGRATION`, and is not part of the rehearsal.

## Rollback

Preferred live rollback is restore of the pre-migration `public_production` dump. `down()` drops `promotion_slot` with `CASCADE`. That is not the production rollback path.
