# Legacy media → product candidate map

Generated **2026-05-16** by `scripts/build-legacy-media-product-candidate-map.mjs`.

## Semantics

| Field | Meaning |
|-------|---------|
| **confirmed** | Exact `sku_hint` vs seed SKU, strong deterministic path/filename SKU match, or basename matches an existing product image filename. |
| **probable** | Strong filename/handle/collection alignment to a single product, lower deterministic certainty than confirmed. |
| **ambiguous** | Multiple seed products score similarly for the same asset. |
| **unmatched** | No heuristic candidate above threshold. |
| **unpreviewable** | A reference path/URL exists but **no local preview** in this environment (e.g. `/WOODRIGHT/...` not mounted). `identity_confidence` still records the SKU guess tier. |

## Source limitation

Matching uses legacy-media-board-products.json (seed + paused-collection workbook rows) when present; otherwise seed-products.json only. No live Store/Admin API.

## Summary counts

| confidence (display) | count |
|---------------------|------:|
| confirmed | 1760 |
| probable | 5 |
| ambiguous | 235 |
| unmatched | 723 |
| unpreviewable | 716 |

- Inventory rows: **3439**
- Seed products indexed: **194**

## Artifacts

- `data/normalized/legacy-media-product-candidate-map.json`
- `data/normalized/legacy-media-assignment-decisions.template.json`
- QA UI: `/qa/legacy-media-assignment-board` (see `docs/storefront/legacy-media-assignment-board.md`)

## Safety

Read-only JSON; no Medusa DB, no catalog-scope, no seed mutation, no production media assignment.
