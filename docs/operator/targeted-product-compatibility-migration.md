# Targeted product_compatibility migration

`medusa db:migrate` loads every module and runs every pending migration. Production still has an unapplied tail. `Migration20250505101505` drops and recreates the primary key of `workflow_execution`. Do not run it to create `product_compatibility`.

This helper applies only `Migration20261005120000`.

It uses the Medusa `Migrations.run` wrapper from the candidate backend image `5aa0c2c7818a42f56d52311c5149222c18d82427` / `sha256:d087b0541ccf846fa7ef1d23108e1f488b20ff47c334a9614746d5047b5c62f3`. That image contains the migration file. The live backend stays `01d8fd57c4b33868be116f09a7a2814f437c43c4` and is not replaced. The live storefront is already `9e44d44015d1a3f1bcd259fca4b8ef09d5b6d4d5` (contacts podium). The helper pins both identities and refuses if either drifts.

The only migration directory loaded is `/server/src/modules/product-compatibility/migrations`. Bookkeeping is one framework row in `mikro_orm_migrations`.

Execute holds `/srv/woodright/locks/public_production/live-cutover.lock`. Dry-run checks that the lock file exists and does not take it. The helper has no down or revert mode. Caller environment variables cannot replace the runner or lock helper paths.

The canonical backup helper stores `application_sha` from the storefront OCI revision and stores `backend_digest` / `storefront_digest` as image ids (`docker inspect container --format {{.Image}}`), not registry repo digests. This helper requires those manifest fields to match the pinned live identity.

## Preconditions

- Environment argument is exactly `public_production`.
- Live database name is `woodright_public_production`.
- Rehearsal database name is `woodright_rehearsal_product_compatibility`.
- Live postgres container is `woodright-public-production-postgres`.
- Rehearsal container is `woodright-rehearsal-product-compatibility`.
- `--live-application-sha` is `01d8fd57c4b33868be116f09a7a2814f437c43c4`.
- Live backend repo digest is `sha256:8c23319c07dd83d7078aae13df5912322df4de0a39ee45b4d561e3b6156152d6`.
- Live storefront revision is `9e44d44015d1a3f1bcd259fca4b8ef09d5b6d4d5` and its repo digest is `sha256:e4288d7bff8a119ad31051b5cfa4dd7f2f5de0874e2668ad84ddc84f77862b93`.
- Migration JS SHA-256 inside the candidate image is `51ef408272c219feddd628497c92bbe1fe75476844f9ea67dd8f01664d901082`.
- `product_compatibility` is absent and `Migration20261005120000` has bookkeeping count 0.
- `Migration20250505101505` has bookkeeping count 0.
- Backup manifest is a successful non-partial `woodright_recovery_point_v2` for `public_production`, created within 72 hours, with `db.size_bytes` > 0 and a matching dump checksum.

## Confirmation

Rehearsal execute: `I_UNDERSTAND_REHEARSAL_PRODUCT_COMPATIBILITY_MIGRATION`

Live execute: `I_UNDERSTAND_LIVE_PUBLIC_PRODUCTION_PRODUCT_COMPATIBILITY_MIGRATION`

The rehearsal token does not authorize live. A generic yes is refused.

## Refusals

- `REFUSED_TARGETED_MIGRATION_NOT_ALLOWED` for every other migration name.
- `ALREADY_APPLIED` when the bookkeeping row and the table both exist. The helper does not run again.
- `BOOKKEEPING_WITHOUT_TABLE` when the row exists and the table does not.
- `PARTIAL_SCHEMA` when the table exists and the row does not.
- `DANGEROUS_MIGRATION_PRESENT` when `Migration20250505101505` is already applied. The helper does not run it.
- `LIVE_APPLICATION_SHA_REFUSED` or `LIVE_APPLICATION_DRIFT` when the live backend or storefront is not the pinned identity.
- Wrong environment, database, container, governance marker, migration hash, or backup manifest.

## Rollback

Preferred rollback is restore of the pre-migration recovery point. The migration class `down()` drops only `product_compatibility`. This helper does not call it. Rolling the application back does not require dropping the table: the previous backend ignores it.
