# Catalog perf - next actions (execute order)

**Date:** 2026-07-12  
**Mandate:** full catalog + key page load optimization - loop until done (no DEFER park)

## Done on main
- PR #24 catalog-perf package
- PR #26 W3e browse compact (JSON 401→232KB)

## In flight
- Browse latency split: product graph without nested price_set/images; batched variant prices

## Next after this lands + Medusa restart
1. Remeasure catalog-products TTFB (DoD warm p95 ≤1s)
2. Remeasure `/catalog` HTML after W3e storefront
3. W3f / home / kids wall-time if still heavy

## Do not
- Bake prod H4 flag without prod coverage
- Cache without publish invalidation
- `git add -A`
