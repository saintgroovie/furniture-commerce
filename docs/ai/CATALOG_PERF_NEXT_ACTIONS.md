# Catalog perf - next actions (execute order)

**Date:** 2026-07-12  
**Mandate:** full catalog + key page load optimization - 12m loop until done

## Done on main
- PR #24 package, #26 W3e compact, #27 browse price split

## Measured after rebuild (local)
| Metric | Before | After |
|--------|--------|-------|
| catalog-products TTFB | ~2.6–3.5s | **~0.16–0.27s** |
| catalog-products bytes | ~401KB | **~222KB** |
| `/catalog` HTML | ~681KB | **~481KB (−29%)** |
| `/catalog` total | ~2.1s | **~0.32s** |
| `/kids/catalog` total | ~5.5s | **~0.30s** |
| `/` total | ~3.9s | **~0.24s** |

## Next
1. Cut SSR `<img>` count on `/catalog` (still 235) - W3f / stricter SSR hero-only
2. Prod H4 when host available
3. Stop loop when catalog+key pages meet load goals without regress

## Do not
- Bake prod H4 flag without coverage
- Cache without invalidation
- `git add -A`
