# Legacy media inventory (read-only)

Generated: **2026-05-04** by `scripts/build-legacy-media-inventory.mjs`.

## Purpose

QA / triage index of **legacy front-manifest references** plus **repo-local** images under static/downloaded/processed/pdf/front trees.  
This is a **reference layer**, not a canonical commercial source and **not** an automatic production media apply.

## Summary

| Metric | Value |
|--------|------:|
| Total indexed items | 3439 |
| Previewable (local binary resolvable in this environment) | 2723 |
| Unpreviewable (manifest or ref without local preview) | 716 |
| `front-manifest.json` rows ingested | 1150 |

### By `source_type`

- **legacy_front:** 1150
- **backend_static:** 645
- **processed_asset:** 634
- **downloaded_asset:** 628
- **unknown:** 382

## Output

- Machine-readable: `data/normalized/legacy-media-inventory.json`
- Matcher: `scripts/build-legacy-media-product-candidate-map.mjs` → `data/normalized/legacy-media-product-candidate-map.json`
- Draggable QA UI: `/qa/legacy-media-assignment-board` (see `docs/storefront/legacy-media-assignment-board.md`)

## Source hierarchy (governance)

- **Backend / Medusa** remains the single source of truth for commercial catalog and published media.
- **Legacy front manifest** (`data/raw/front/front-manifest.json`) and mirrored paths are **reference / hint** sources only (extra gallery, interim evidence, human matching). They must not automatically replace production-ready white-background or governed static assignments.

## Safety

- No database writes, no Medusa product/seed/metadata mutation, no asset copy/rename in this pass.
