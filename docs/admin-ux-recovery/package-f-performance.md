# Package F — Performance notes

**Date:** 2026-07-12 (MSK)

## Dashboard

| Call | Bound |
|------|-------|
| Draft count | `limit=1` + `count` |
| Thumbnail sample | ≤ 3 × 50 published products |
| Product search | `q` + `limit`/`offset` (default 20) |
| Recent products/promotions | `limit=5` each |
| Promotion attention | **link only** — no global scan |

No whole-catalog fetch. No background polling.

## Product / gallery / promotions (regression expectations)

- Product Workspace: one bundle fetch per open
- Gallery 96: no full-original preload (Package D)
- Promotion selectors: rule-value pagination (Package E)
- No request loops in dashboard (single load + debounced search)

## Residual

Live request counts confirmed in browser QA artifact when `:9001` available.
