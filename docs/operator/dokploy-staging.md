# Dokploy staging — Woodright

## Backend Docker DNS alias (`backend`)

Storefront same-origin media proxy depends on hostname `backend`:

- `MEDUSA_BACKEND_URL` / `MEDUSA_BACKEND_INTERNAL_URL` default: `http://backend:9000`
- Next rewrite: `/product-static/*` → `${backendUrl}/static/*`

Compose service name alone is **not** enough when public containers use
`container_name: woodright-staging-*` and are recreated via `docker create`
(cutover keepers). Those recreates do not inherit Compose service DNS.

**Canonical contract** in `docker-compose.staging.yml`:

```yaml
  backend:
    networks:
      woodright_staging:
        aliases:
          - backend
      dokploy-network: {}
```

Rules:

- Alias exists only on the shared app network (`woodright_staging` /
  project-prefixed `*_woodright_staging`), never as public DNS.
- Exactly one **running** public backend may hold alias `backend`.
- Candidate / private containers must not hold this alias on the public shared network.
- Manual `docker network connect --alias backend` is emergency-only; after
  declarative compose apply + recreate it must not be required.

Verifier (CI + VM):

```bash
node scripts/release/verify-backend-network-alias.cjs
node scripts/release/verify-backend-network-alias.cjs --fixture-dir scripts/release/fixtures/backend-alias
# on public host after recreate (SHA required — fail-closed):
node scripts/release/verify-backend-network-alias.cjs --live \
  --expected-release-sha 646d4e6c313deb2ba3c2ccbc6f57566959e53d71
```

Emergency-only (non-durable) restore before rollback:

`EMERGENCY_BACKEND_ALIAS=1 SHARED_NET=… ./scripts/release/attach-backend-network-alias.sh`


If `ENOTFOUND backend` returns after a recreate: treat as failed cutover —
restore declarative compose / recreate backend; do not close the incident with
a one-off manual alias.

## Release candidate policy

- Staging must deploy an **immutable git SHA**, not a dirty worktree.
- Staging release branch: `integrate/deploy-candidate-20260716`
  - built from current `origin/main` plus backend schema compatibility (PR #42),
    Dokploy staging packaging, and catalog browse gallery-strip projection.
  - After merge to `main`, deploy the merge commit SHA (not a dirty worktree).
- GHCR workflow `Build staging images` requires GitHub Environment `staging`
  secrets (`STAGING_NEXT_PUBLIC_*`). It refuses localhost / empty publishable key.
  For first cutover, VM-local `docker build` with real build-args is acceptable
  if GHCR secrets are not yet configured — still tag images with the full Git SHA.
- Provider in Dokploy: **only** `Dokploy-2026-07-16-izsro0`.
- Do **not** use `Dokploy-2026-07-16-rsbgii`.

## Deployment model (first staging)

1. Create Dokploy project `woodright-staging`.
2. Preferred: deploy `docker-compose.staging.yml` from this branch (has `build:` for backend/storefront).
   Alternative: two Dockerfile applications + managed Postgres/Redis — same images/env contract.
3. Inject secrets via Dokploy env/secret storage (never commit values).
4. Run migrations as a **one-shot** before relying on the API.
   Use the image tag that compose built (default `woodright-backend:local`) or set
   `WOODRIGHT_BACKEND_IMAGE=woodright-backend:<sha>` before `docker compose build`.

```bash
docker run --rm --network <staging_net> \
  -e NODE_ENV=production \
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  -e JWT_SECRET=... \
  -e COOKIE_SECRET=... \
  -e STORE_CORS=... \
  -e ADMIN_CORS=... \
  -e AUTH_CORS=... \
  -e MEDUSA_BACKEND_URL=... \
  -e MEDUSA_LOCAL_HTTP=1 \
  "${WOODRIGHT_BACKEND_IMAGE:-woodright-backend:local}" ./scripts/migrate-only.sh
```

Image CMD uses `./node_modules/.bin/medusa` (not `yarn`) so non-root UID 10001 does not need write access to `/server/.yarn`. App root is compiled `dist/` (`medusa-config.js`).

Do **not** auto-seed. Do **not** migrate Dokploy’s own Postgres.

## Images

```bash
# backend (context = apps/backend)
docker build -t woodright-backend:<sha> -f apps/backend/Dockerfile apps/backend

# storefront (context = repository root — required for shared backend lib imports)
# Buyer-facing / cutover images MUST bake a real publishable key and public URLs.
# Do not use empty NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY for :3002 cutover candidates.
docker build -t woodright-storefront:<sha> -f apps/storefront/Dockerfile . \
  --build-arg NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api-staging.example \
  --build-arg MEDUSA_BACKEND_URL=http://backend:9000 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://staging.example \
  --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<staging-publishable-key> \
  --build-arg NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=0
```

Legacy `Dockerfile.dev` files remain for local Docker hybrid demos only.

## Publishable API key bootstrap

`NEXT_PUBLIC_*` values are compile-time. An empty publishable key produces a storefront that cannot load `/catalog` (Store API returns 400).

Allowed bootstrap sequence (admin only, not a public cutover candidate):

1. If no publishable key exists yet, create one in Medusa Admin (backend can run without a storefront key).
2. Link the key to the Default Sales Channel.
3. Build the storefront with the **real** key and real public URLs.
4. Only then tag/deploy that image as the `:3002` cutover candidate.

Never leave an empty-key storefront image on the public staging port.

## Media

Mount dedicated volume at `/server/static` (image pre-creates dir as UID 10001). Copy catalog media from a verified source after deploy. Keep `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=0` until coverage gate passes.

### Staging media sync (required for buyer images)

Storefront serves product photos via same-origin rewrite:

`/product-static/*` → Medusa `GET /static/*` (see `apps/storefront/next.config.js`).

If the staging volume is empty, homepage/catalog images return **404** even when URLs are correct (no `localhost`).

Verified source (Mac, do not delete):

- path: `apps/backend/static` on the canonical checkout that matches the accepted catalog media set
- expected scale: ~3000+ files / ~350MB+

Sync into the staging Docker volume (example; adjust compose project prefix if needed):

```bash
# Mac: archive (no secrets)
tar -C apps/backend/static -czf /tmp/woodright-staging-static.tgz .

# Upload to VM import area, then on VM:
VOL=$(docker volume inspect woodright-stack-3dsdhd_woodright_staging_media -f '{{.Mountpoint}}')
sudo tar -xzf /srv/woodright/import/files/woodright-staging-static.tgz -C "$VOL"
sudo chown -R 10001:10001 "$VOL"

# Smoke (must be image/jpeg 200, not HTML 404):
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' \
  http://127.0.0.1:9000/static/products/oliver/OL-95-1_gallery_02.jpg
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' \
  http://127.0.0.1:3002/product-static/products/oliver/OL-95-1_gallery_02.jpg
```

Do **not** invent stub images. Do **not** delete the Mac source after sync.

### Catalog data + publishable key (required for `/catalog`)

Empty migrated schema alone is not enough. Staging needs:

1. Catalog-safe DB import (products/variants/prices/regions/collections/classifications/media refs) with **scrub** of customers, orders, carts, users, auth, and API keys.
2. All intended products linked to the Default Sales Channel (`product_sales_channel`).
3. A **new** publishable API key created in staging Admin, linked to that sales channel.
4. Storefront **rebuild** with `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (Next inlines `NEXT_PUBLIC_*` at build time). Runtime-only env is not enough.

Without (3)+(4), storefront SSR calls `/store/catalog-products` return 400 and the UI shows «Каталог не загрузился» even when the database has products.

## Data exclusions

Do not import customers, orders, addresses, sessions, payment secrets, or legacy admin passwords.

## Rollback

Redeploy previous image tag SHA; restore staging Postgres from the last staging dump if schema changed. Never delete source media or Dokploy volumes.

## HTTP IP staging note

HTTPS staging/demo must keep `MEDUSA_LOCAL_HTTP=0` (or unset). Production Medusa config forces `Secure` cookies and ignores `MEDUSA_LOCAL_HTTP=1` for cookie flags (misconfiguration safety).

Temporary cleartext `http://IP` admin review (local/operator only, not buyer Host): set `MEDUSA_LOCAL_HTTP=1` so cookies work without TLS. Switch back to `0` before HTTPS cutover.

Internal Postgres DSN must include `sslmode=disable` (Node `pg` otherwise may stall during migrate/start SSL negotiation).
