# Catalog perf - next actions

**Date:** 2026-07-12  
**Local cold-load optimization:** DONE (loop stopped)

## Landed on main
| PR | What |
|----|------|
| #24 | Catalog-perf package (browse API, H4, W3g) |
| #26 | W3e compact browse VM |
| #27 | Browse price-split latency |
| #29 | SSR hero-only catalog extras |
| #30 | PDP display-group lean fetch |
| #31 | RoomSet `?view=storefront` lean |

## Local measured (worktree production build on :3002 + Medusa :9000)
| Surface | Result |
|---------|--------|
| catalog-products | ~0.13s / ~222KB |
| `/catalog` | ~310KB, 99 imgs, ~0.24s total |
| `/kids/catalog` | ~127KB, 39 imgs |
| PDP (display_group) | TTFB ~0.09–1.3s (was multi-10s) |

## Operator-only remaining
1. **Prod H4:** generate → deploy derivatives → `h4-coverage-gate --http` → bake `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1`
2. Re-measure RoomSet lean on **populated** `room_sets`
3. Prod smoke: catalog ids / kids / facets / heroes / PDP / rooms

## Do not
- Restart speculative local levers without new bottleneck evidence
- Bake prod H4 flag without coverage gate
