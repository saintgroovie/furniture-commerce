# Seed Generation Plan (Real Data Draft)

## What `seed.ts` draft should consume

New draft seed should consume normalized seed input layer:

- `data/normalized/seed-collections.json`
- `data/normalized/seed-categories.json`
- `data/normalized/seed-products.fixed.json` (preferred when present) or `data/normalized/seed-products.json`
- `data/normalized/seed-assets.json`
- `data/normalized/seed-summary.json` (validation/reference only)

The seed implementation must not read `processed_path` directly. It should only use final public URLs from the chosen seed products file / `seed-assets.json`.

## Creation order of entities

1. Ensure region (RUB/RU) exists.
2. Ensure product collections from `seed-collections.json`.
3. Ensure product categories from `seed-categories.json`.
4. Create missing products from `seed-products.fixed.json` if present, else `seed-products.json`, with:
   - title, handle, status
   - one Default option/variant
   - variant SKU and price
   - thumbnail + images from final URLs
5. Link products to categories.
6. Link products to collections.
7. Create and link `ProductClassification` records (`CONFIGURABLE` / `STANDARD`).
8. Ensure stock location and inventory levels.

This order keeps backend as source of truth and keeps storefront thin.

## Product image attachment rules

- Product `thumbnail` should use `main_image_url` when available.
- Product `images[]` should be built from `image_urls` (main + gallery URLs).
- Color variant URLs remain in metadata/context for future variant expansion; they are not promoted to Medusa variant images in this first pass.
- If product has only gallery-as-main caveat, first gallery URL is used as fallback main (already normalized in seed input).

## CONFIGURABLE vs STANDARD in first seed

- Use `medusa_product_type` from seed product input as the source of truth.
- First seed keeps `single_default` variant strategy for both types.
- `CONFIGURABLE` items are represented with one default purchasable variant (MVP constraint).
- `STANDARD` accessories remain standard single-variant products.
- `BESPOKE` workbook items are not introduced in this real-data seed scope.

## Explicit first-seed exclusions

Remain excluded from this pass:

- `blocked_by_business_decision` (VV modeling unresolved)
- `unresolved_mapping` (fuzzy/PDF-unconfirmed)
- `no_confirmed_assets`

Do not backfill these via assumptions or fuzzy matching in seed generation.

## Future migrations / expansion

Future expansion path after business and mapping confirmation:

1. Resolve VV modeling decision:
   - separate products vs variant axis model.
2. Ingest excluded collections with confirmed assets:
   - Willie Winkie, Monchelsea, Princess Rose, Oxford, Greenwich, Accessories.
3. Introduce richer variant model when business confirms axes:
   - finish/color/material dimensions.
4. Optional production storage migration:
   - move from local uploads to S3/CDN while keeping stable storage-key contract.

## Pre-merge validation before replacing canonical `seed.ts`

- Dry-run draft seed against fresh local DB.
- Verify collection/category/product counts match `seed-summary.json`.
- Verify all product image URLs resolve via Medusa `/uploads`.
- Verify product classification links exist for all seeded products.
- Validate no excluded product handles are present in seeded dataset.
