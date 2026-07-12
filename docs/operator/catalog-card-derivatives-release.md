# Catalog card derivatives (H4) - production release checklist

**Status:** local ready; prod flag **off** until this checklist passes on the **production** Medusa static host.  
**Related:** `docs/ai/CATALOG_PERF_NEXT_PLAN.md`, commits `785c08b`…`f560329`.

## Why

`NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1` rewrites catalog **card heroes** to sibling WebPs under:

`/static/products/<collection>/derivatives/card/<basename>.webp`

Missing files → broken heroes (UI `onError` is only a safety net). Generate + deploy + HTTP coverage **before** baking the flag into a production storefront build.

## Prerequisites

- Medusa serves `/static/products/**` (same host buyers hit for thumbnails).
- Derivatives are **not** in git (`apps/backend/static/products/.gitignore`).
- Storefront build-time bake: `NEXT_PUBLIC_*` is fixed at `yarn build`.

## Steps (prod)

### 1. Generate on a machine with the product static tree

```sh
cd apps/backend
yarn generate:catalog-card-derivatives
```

Expect thousands of WebPs under `static/products/**/derivatives/card/` (local reference: ~1575).

### 2. Deploy derivatives to the production static root

Copy/rsync **only** `**/derivatives/card/*.webp` onto the prod Medusa `static/products` tree (same layout as local).  
Do **not** invent a BFF/CDN in this step - W3h CDN is a later lever.

### 3. Coverage gate (must exit 0 against **prod** Medusa URL)

From storefront (with publishable key for that env):

```sh
cd apps/storefront
set -a && source .env.local && set +a   # or prod-equivalent env
export NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<prod-medusa-host>
../backend/node_modules/.bin/tsx scripts/h4-coverage-gate.ts --http
```

DoD: `tmp/catalog-perf/h4-coverage-manifest.md` → **missing_derivative: 0**, HTTP check true.

Optional offline disk check against a synced tree:

```sh
../backend/node_modules/.bin/tsx scripts/h4-coverage-gate.ts \
  --from-file ../../tmp/catalog-perf/catalog-products.g1.json
```

### 4. Only then bake the flag into the **production** storefront build

```sh
cd apps/storefront
NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1 yarn build
# deploy .next-build / start as usual
```

Keep `.env.example` default at `0`. Local QA may use `1` without claiming prod.

### 5. Smoke

- `/catalog` and `/kids/catalog`: cards 107 / 38 (or current published counts)
- Sample LCP/hero URL contains `/derivatives/card/` and HTTP 200
- PDP heroes unchanged (still full assets)

## Rollback

1. Rebuild storefront with `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=0` and redeploy.  
2. Derivatives may remain on disk (harmless if flag is off).

## Do not

- Enable flag in prod without steps 1–3  
- Commit derivative binaries  
- Point CDN (W3h) before this path is green once without CDN
