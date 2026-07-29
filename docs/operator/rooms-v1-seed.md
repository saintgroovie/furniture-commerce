# RoomSet V1 seed (owner-approved)

Idempotent seed for two published RoomSets (fail-closed staging / production targets):

| Slug | Title | Card order |
|------|-------|------------|
| `spalnya-greenwich` | Спальня Greenwich | 1 |
| `spalnya-cloud` | Спальня Cloud | 2 |

Historical seed slugs (`spalnya`, `gostinaya`, …) stay inactive forever under this script.
Oliver remains `DEFERRED` (not created).

Manifest ID: `rooms-v1-owner-approved`  
Pinned manifest SHA: `71ef39d2699330bb2c0bca59f968bc695151b87d9ad9b7f23d9b35be0c07b67e`

## Required environment

| Variable | Staging | Production |
|----------|---------|------------|
| `ROOMSET_SEED_TARGET` | `staging` | `production` |
| `ROOMSET_SEED_SCOPE` | `rooms-v1-owner-approved` | same |
| `ROOMSET_SEED_MODE` | `dry-run` or `apply` | same (required) |
| `DATABASE_URL` | DB name exact `woodright_staging` | exact `woodright_production` |
| `ROOMSET_SEED_CONFIRM` | unset | `ROOMSET_V1_PRODUCTION_OWNER_APPROVED` |
| `ROOMSET_SEED_PRODUCTION_ACK` | unset | `I_UNDERSTAND_THIS_WRITES_PRODUCTION` |

Legacy `WOODRIGHT_ROOMS_V1_*` flags are rejected (FAIL_CLOSED).
`NODE_ENV` is not authorization.
Missing mode → FAIL_CLOSED (no silent dry-run default).

## Run (local TypeScript)

```sh
ROOMSET_SEED_TARGET=staging \
ROOMSET_SEED_SCOPE=rooms-v1-owner-approved \
ROOMSET_SEED_MODE=dry-run \
  npx medusa exec ./src/scripts/seed-rooms-v1-owner-approved.ts

ROOMSET_SEED_TARGET=staging \
ROOMSET_SEED_SCOPE=rooms-v1-owner-approved \
ROOMSET_SEED_MODE=apply \
  npx medusa exec ./src/scripts/seed-rooms-v1-owner-approved.ts
```

## Run (immutable backend image)

```sh
ROOMSET_SEED_TARGET=staging \
ROOMSET_SEED_SCOPE=rooms-v1-owner-approved \
ROOMSET_SEED_MODE=dry-run \
  ./node_modules/.bin/medusa exec ./src/scripts/seed-rooms-v1-owner-approved.js
```

Production apply is **owner-gated** and is never part of deploy/CMD/health/migrate.
Do not paste credentials into shell history; use container `DATABASE_URL`.

The image build compiles ops scripts via `apps/backend/scripts/compile-ops-seeds.mjs`
into `dist/src/scripts/` (plan, manifest, target-gate, owner-approved).

Card order uses create order (Cloud first, Greenwich second) so store `created_at DESC`
yields Greenwich → Cloud. No schema migration.

Rollback: set `is_active=false` on the two V1 slugs only. Do not delete historical rows.
