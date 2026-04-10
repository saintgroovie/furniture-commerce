# Real Seed Readiness Report

## Summary

Controlled local asset upload and seed-input generation are complete for the confirmed first-pass subset.

- Local upload executed from `asset-upload-execution-manifest.json`
- Seed input layer generated from confirmed mapping + binding + upload artifacts
- Draft seed implementation created in parallel file (`seed-real-data.ts`)
- Canonical `seed.ts` was not modified

## Upload execution result

Source: `data/processed/asset-manifests/local-upload-summary.json`

- Last confirmed run:
  - `manifest_entries`: **441**
  - `eligible_ready_entries`: **441**
  - `copied`: **0**
  - `skipped_identical`: **441**
  - `failed`: **0**
  - `validated_successfully`: **441**

Upload status artifacts:

- `data/processed/asset-manifests/local-upload-status.json` — array of per-entry execution records (review-friendly, no wrapper)
- `data/processed/asset-manifests/local-upload-failures.json` — array of failure records (empty on last run)
- `data/processed/asset-manifests/local-upload-summary.json` — expanded run summary

Merged script behavior (`scripts/upload-assets-to-local-storage.py`):

- upload is idempotent and safe: existing identical files -> `skipped_identical`
- existing different destination is blocked by default; overwrite requires explicit `--overwrite-different`
- post-copy validation is enforced (target exists + hash match)
- helper modes are available:
  - `--write-manifest` (writes execution manifest; confirmed 441 rows)
  - `--write-seed-inputs` (writes seed input layer; confirmed 108 products)

## Seed input scope

Source: `data/normalized/seed-summary.json`

- Products in first real-data seed scope: **108**
  - `seed_ready`: 80
  - `seed_ready_with_caveat`: 28
- Collections: **3**
  - `country-london-paris`, `oliver`, `provence`
- Categories: **17**
- Asset URLs materialized for scope: **441**
  - main: 93
  - gallery: 178
  - color_variant: 170
- Assets marked with caveat visibility: **121**

## Included and excluded boundaries

Included:

- only confirmed mapped products from the normalized mapping/binding layer
- only products represented in seed input files

Excluded (remain out of first seed):

- `blocked_by_business_decision`: 63
- `unresolved_mapping`: 84
- `no_confirmed_assets`: 86

Collection-level excluded distribution is preserved in `seed-summary.json` and full item-level list remains in `data/normalized/entity-mapping-excluded.json`.

## Draft seed generation result

Draft created:

- `apps/backend/src/scripts/seed-real-data.ts`

Draft characteristics:

- consumes `seed-collections.json`, `seed-categories.json`, and products from `seed-products.fixed.json` when present, else `seed-products.json`
- creates/ensures collections and categories
- creates missing products with final public image URLs
- links categories and product classifications
- keeps inventory setup aligned with existing seed approach
- does not overwrite existing canonical `seed.ts`

## Coherence and data quality notes

- `entity-mapping-summary.json` reports 109 mapped products, while the actual current `entity-mapping.json` and `product-asset-binding.json` contain 108 seed-eligible records.
- Generated artifacts follow the actual source arrays for deterministic execution.
- Caveat flags (`gallery_only`, `legacy_fallback`, `low_res_temporary`, `needs_reshoot`) are preserved in manifest and seed input layer.

## Readiness assessment

Project is **ready to run the draft real-data seed** in local environment for the confirmed subset.

Blocking conditions for canonical replacement are not technical now; they are review and acceptance checks.

## Manual checks before merging/replacing canonical `seed.ts`

1. Run draft seed on a clean local DB snapshot and confirm no runtime errors.
2. Verify counts in Medusa Admin:
   - collections = 3
   - categories = 17
   - products in scope = 109 when using `seed-products.fixed.json`, else 108 from generator `seed-products.json`
3. Spot-check image accessibility:
   - open several URLs from the same seed products file the script loaded
   - confirm served from `/static/products/...` (Medusa v2 static middleware)
4. Confirm no excluded handles from `entity-mapping-excluded.json` are created.
5. Validate product classification links exist for all seeded products.
6. Approve caveat products for MVP visibility (especially `needs_reshoot` and legacy fallbacks).
