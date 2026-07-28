# RoomSet V1 seed (owner-approved)

Staging-only idempotent seed for two published RoomSets:

| Slug | Title | Card order |
|------|-------|------------|
| `spalnya-greenwich` | Спальня Greenwich | 1 |
| `spalnya-cloud` | Спальня Cloud | 2 |

Historical seed slugs (`spalnya`, `gostinaya`, …) stay inactive forever under this script.

## Run

Local source tree (TypeScript):

```sh
# dry-run
npx medusa exec ./src/scripts/seed-rooms-v1-owner-approved.ts

# apply (staging)
WOODRIGHT_ROOMS_V1_CONFIRM=1 WOODRIGHT_ROOMS_V1_APPLY=1 \
  npx medusa exec ./src/scripts/seed-rooms-v1-owner-approved.ts
```

Immutable staging backend image (compiled JS, after clean recreate — no host bind):

```sh
# dry-run / plan (default)
./node_modules/.bin/medusa exec ./src/scripts/seed-rooms-v1-owner-approved.js

# apply (staging only — both flags required)
WOODRIGHT_ROOMS_V1_CONFIRM=1 WOODRIGHT_ROOMS_V1_APPLY=1 \
  ./node_modules/.bin/medusa exec ./src/scripts/seed-rooms-v1-owner-approved.js
```

The production image build compiles these ops scripts via
`apps/backend/scripts/compile-ops-seeds.mjs` into `dist/src/scripts/`.
They are **not** run on container start, healthcheck, or migrate.

Card order uses create order (Cloud first, Greenwich second) so store `created_at DESC` yields Greenwich → Cloud. No schema migration.

Shared products across rooms require `room-set-product` link with `isList: true` on **both** sides. Each `room_set_item` must still resolve to exactly one product (seed/API fail-closed on multi-link).

Rollback: set `is_active=false` on the two V1 slugs only. Do not delete historical rows.

SQL backup example (staging):

```sh
pg_dump -U woodright -d woodright_staging \
  --table=room_set --table=room_set_item \
  --table=product_product_roomsetmodule_room_set_item \
  --no-owner --no-acl > rooms-v1-backup.sql
```
