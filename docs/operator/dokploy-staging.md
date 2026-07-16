# Dokploy staging — Woodright

## Release candidate policy

- Staging must deploy an **immutable git SHA**, not a dirty worktree.
- Staging release branch: `chore/dokploy-staging-release-20260716`
  - includes `origin/main` **plus** backend schema compatibility (PR #42) until that PR merges to `main`.
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
docker build -t woodright-storefront:<sha> -f apps/storefront/Dockerfile . \
  --build-arg NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api-staging.example \
  --build-arg MEDUSA_BACKEND_URL=http://backend:9000 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://staging.example \
  --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY= \
  --build-arg NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=0
```

Legacy `Dockerfile.dev` files remain for local Docker hybrid demos only.

## Publishable API key bootstrap

1. First storefront image may bake an **empty** `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` so the panel can boot and an admin can create a key.
2. Create the publishable key in Medusa Admin.
3. **Rebuild** storefront with the real key build-arg and redeploy storefront only.

## Media

Mount dedicated volume at `/server/static` (image pre-creates dir as UID 10001). Copy catalog media from a verified source after deploy. Keep `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=0` until coverage gate passes.

## Data exclusions

Do not import customers, orders, addresses, sessions, payment secrets, or legacy admin passwords.

## Rollback

Redeploy previous image tag SHA; restore staging Postgres from the last staging dump if schema changed. Never delete source media or Dokploy volumes.

## HTTP IP staging note

If reviewing over `http://IP` (no TLS yet), set `MEDUSA_LOCAL_HTTP=1` so admin/store cookies work. Switch to `0` when HTTPS domains are attached.
