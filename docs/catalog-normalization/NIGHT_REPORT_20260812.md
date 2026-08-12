# Catalog normalization night — metrics summary (2026-08-12)

Base SHA: `c7ec445` (`origin/main`)
Branch: `feat/catalog-normalization-night-20260812`
Local QA DB apply: yes (localhost only; rollback snapshots under untracked `artifacts/`)
Production mutation: **NO**

## Pedestal codes (VERIFIED via `metadata.pedestal_filling`)

| Code | Meaning |
|------|---------|
| Я | ящики (DRAWERS) |
| П | полки (SHELVES) |

## Before → After (published catalog)

| Metric | Before | After |
|--------|--------|-------|
| products | 157 | 157 |
| SKUs unique | 157 | 157 |
| price diffs | — | **0** |
| pedestal factory codes in titles | 5 | **0** |
| incorrect «дверца» expansions | (brief) | **0** (corrected to полки) |
| upholstery without presentation/semantic_type | 18 | **0** |
| Medusa stub option Default (DB) | 157 | 157 (hidden buyer/admin preview) |

## Safe auto-applied

1. Pedestal title expansion (shelves/drawers) + collection
2. Execution presentation annotation
3. `metadata.public_title` for Greenwich merges
4. Storefront cards/PDP public-title contract
5. PASS C: texture swatches only from `swatchImageUrl` (no hero fallback)
6. Admin buyer preview widget

## Owner review

`artifacts/catalog-normalization/catalog-normalization-review.json` (local) / summary in PR:
- ol-08-1 / mirror identity conflict
- s-ox-05 thin data
