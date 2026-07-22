# Woodright SEO indexing policy (demo / staging)

Owner policy (do not re-ask):

| Host | Policy |
|------|--------|
| `woodright-demo.ru` | **NOINDEX** (staging/demo, not public production) |
| `api.woodright-demo.ru` | **NOINDEX** |
| Legacy `woodright.ru` | **Do not touch** (still on legacy site) |

## Contract

Server env (storefront):

```bash
WOODRIGHT_INDEXING_MODE=noindex   # default / fail-closed
# WOODRIGHT_INDEXING_MODE=index   # only with owner approval + production cutover release
```

- Empty or unknown values → `noindex`
- Not `NEXT_PUBLIC_*` — browser must not own SEO policy
- Not hostname-only — future production cutover is an explicit env + release

## Behavior in `noindex`

| Surface | Behavior |
|---------|----------|
| `/robots.txt` | `User-agent: *` / `Disallow: /` — **no** Sitemap URL |
| `/sitemap.xml` | **404** (no buyer URL list) |
| HTML `robots` meta | `noindex, nofollow` + `noarchive` |
| `X-Robots-Tag` | `noindex, nofollow, noarchive` (buyer middleware; API via Traefik) |
| Canonical | **omitted** (avoids false link to legacy production) |
| Open Graph / Twitter | **allowed** (social previews) |

## Production cutover (deferred)

Requires separate owner approval:

1. DNS / domain cutover to Medusa/Next runtime
2. Explicit `WOODRIGHT_INDEXING_MODE=index`
3. Sitemap publication
4. Canonical policy for production host
5. Structured-data / SEO copy campaigns as needed

Do not enable `index` on `woodright-demo.ru`.
