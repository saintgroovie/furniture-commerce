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
| `WOODRIGHT_INDEXING_MODE` | Server-only. `noindex` (default/fail-closed) or `index`. Empty/unknown → `noindex`. Never `NEXT_PUBLIC_*`. Demo staging must stay `noindex`. Production indexing requires owner approval + separate release |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | From Medusa admin |
| `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES` | Default `0` |

### SEO policy (demo / staging)

- `woodright-demo.ru` and `api.woodright-demo.ru` are **noindex**
- `/robots.txt` → `Disallow: /` (no Sitemap line)
- `/sitemap.xml` → **404** while mode is noindex
- Buyer HTML: `robots` meta + `X-Robots-Tag: noindex, nofollow, noarchive`
- API Host: Traefik (or app) `X-Robots-Tag` — do not index
- Canonical omitted in noindex mode (do **not** point at legacy `woodright.ru`)
- Open Graph / social previews remain allowed
- Switching to `index` is **not** a DNS/hostname flip alone — explicit env + release + owner approval

Never commit real secret values.
