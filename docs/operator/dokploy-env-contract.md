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
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | From Medusa admin |
| `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES` | Default `0` |

Never commit real secret values.
