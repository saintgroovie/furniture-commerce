# Catalog perf - next actions (execute order)

**Date:** 2026-07-12  
**Repo:** `/Users/leonidmbp/Documents/projects/furniture-commerce`  
**Operator mandate:** full catalog + key page load optimization - no parking on DEFER

## Order

| # | Action | Status |
|---|--------|--------|
| 1–4 | Split + PR #24 merge + docs | DONE (`6192f49`) |
| 5 | W3e compact browse VM (API + RSC props) | IN PR `feat/catalog-w3e-browse-model` |
| 6 | Prod H4 bake flag | WAIT (needs prod host) - does **not** block local levers |
| 7 | W3f / rooms / home / API latency | NEXT after W3e lands |
| 8 | W3h CDN | after prod H4 coverage |

## W3e evidence

- Live `catalog-products` JSON: 401KB → 232KB (−42%) via image+execution URL caps
- Target: `/catalog` HTML ≥30% reduction after storefront picks up mapper

## Do not

- Bake prod `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1` without prod coverage
- Strip execution keys entirely for metrics
- `git add -A`
