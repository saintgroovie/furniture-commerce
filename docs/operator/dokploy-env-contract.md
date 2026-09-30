# Environment contract (staging / production)

## Backend runtime (required)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Dedicated Woodright DB only. For Docker-internal Postgres use `?sslmode=disable` (or `&sslmode=disable`) so Node `pg` does not hang on SSL negotiation. |
| `REDIS_URL` | Required when `NODE_ENV=production` |
| `JWT_SECRET` | ≥32 chars, unique per environment |
| `COOKIE_SECRET` | ≥32 chars, unique per environment |
| `STORE_CORS` | Exact storefront origins |
| `ADMIN_CORS` | Exact admin origins |
| `AUTH_CORS` | Auth origins matching admin/store |
| `MEDUSA_BACKEND_URL` | Public backend URL |
| `MEDUSA_LOCAL_HTTP` | Must be `0` (or unset) on HTTPS staging/demo. Set `1` only for temporary cleartext `http://IP` local/admin review — production code ignores it for cookie `Secure` |

## Storefront build-time (required)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | Browser-facing API URL |
| `MEDUSA_BACKEND_URL` | SSR/internal URL |
| `NEXT_PUBLIC_SITE_URL` | Site URL for OG / metadataBase (demo: `https://woodright-demo.ru`) |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | From Medusa admin |
| `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES` | Default `0` |
| `WOODRIGHT_INDEXING_MODE` | Server-only. `noindex` / `private_noindex` (default/fail-closed) or `index` / `public_indexable`. Empty/unknown → noindex. Never `NEXT_PUBLIC_*`. Demo staging must stay noindex. Production indexing requires owner approval + separate release |
| `WOODRIGHT_CANONICAL_DOMAIN` / `WOODRIGHT_CANONICAL_SITE_URL` | Target public apex (`woodright.ru` / `https://woodright.ru`). Prepared in templates; do not apply to private loopback candidate until cutover |
| `WOODRIGHT_CANONICAL_API_ORIGIN` | Target public API (`https://api.woodright.ru`). Used for CSP connect-src in public mode |
| `WOODRIGHT_ADMIN_EXPOSURE` | `private` (approved) \| `restricted` \| `public` (not approved) |
| `WOODRIGHT_PAYMENT_LAUNCH_MODE` | `manager_payment_link` (approved launch) \| `request_only` \| `online_psp` (fail-closed without PSP credentials) |
| `WOODRIGHT_LEGAL_*` | Owner legal fields for privacy/offer/delivery/payment/returns/warranty - required before DNS cutover; never invent |
| `YANDEX_METRIKA_ID` | Digits only. **Runtime** on the storefront Node process (compose `environment`, not a Docker build-arg, not `NEXT_PUBLIC_*`). Empty = no Metrika, no consent banner, `/cookies` says analytics is off. `public_demo` / candidate roles ignore the ID even if set. After setting the ID: recreate/restart **storefront only** - do not rebuild the image |
| `GOOGLE_SITE_VERIFICATION` | Optional Search Console HTML token. Runtime, same compose passthrough. Empty = no meta |
| `YANDEX_WEBMASTER_VERIFICATION` | Optional Yandex Webmaster HTML token (`YANDEX_VERIFICATION` alias). Runtime. Empty = no meta |

**Metrika env sequence (proven):** bake the storefront image **without** the counter ID. Pass `YANDEX_METRIKA_ID` at container start via `ops/compose/woodright-public-production.docker-compose.yml`. The layout Server Component and `proxy.ts` CSP extras read `process.env` per request the same way as `WOODRIGHT_RUNTIME_ROLE`. Changing the ID later is a storefront restart/recreate, not a new bake.

Do not commit real counter IDs or verification tokens. Demo/staging must keep Metrika unset; the code also refuses `WOODRIGHT_RUNTIME_ROLE=public_demo`.

### SEO policy (demo / staging)

- `woodright-demo.ru` and `api.woodright-demo.ru` are **noindex**
- `/robots.txt` → `Disallow: /` (no Sitemap line)
- `/sitemap.xml` → **404** while mode is noindex
- Buyer HTML: `robots` meta + `X-Robots-Tag: noindex, nofollow, noarchive`
- API Host: Traefik (or app) `X-Robots-Tag` — do not index
- Canonical omitted in noindex mode
- Open Graph / social previews remain allowed
- Switching to `index` / `public_indexable` is **not** a DNS/hostname flip alone — explicit env + release + owner approval
- Production Traefik template: `docs/operator/traefik-woodright-production.INACTIVE.yml` (do not activate without cutover approval)
- Launch readiness: `node scripts/release/verify-public-launch-readiness.cjs --check-static`

Never commit real secret values.
