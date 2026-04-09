# Asset Binding Readiness Note

Оценка готовности processed asset layer для создания binding layer.

---

## Are There Enough Processed Assets?

**Yes, for 3 complete collections.**

| Collection | Products | Processed Main | Processed Gallery+Color | Ready? |
|-----------|----------|---------------|------------------------|--------|
| Oliver | 67 | 47 | 239 | **Yes** |
| Provence | 29 | 27 | 43 | **Yes** |
| Country-London-Paris | 13 | 4 | 85 | **Yes** |
| **Total** | **109** | **78** | **367** | **Yes** |

109/167 production subset items have at least one processed asset.
All 109 have workbook data (price, dimensions, category).

---

## What the Binding Layer Should Map

For each product in the production subset:

```json
{
  "workbook_row_key": "oliver:OL-01-2",
  "product_code_normalized": "OL-01-2",
  "canonical_name": "Шкаф для одежды 1-дв. с зеркалом",
  "collection_name_normalized": "oliver",
  "category_normalized": "Шкафы",
  "price_normalized": 85200,
  "dimensions_normalized": { ... },

  "main_image": {
    "processed_path": "data/processed/storefront-assets/oliver/OL-01-2_main.jpg",
    "source_provenance": "disk_white_bg",
    "width": 1200,
    "height": 1200
  },

  "gallery_images": [
    {
      "processed_path": "data/processed/storefront-assets/oliver/OL-01-2_gallery_01.jpg",
      "source_provenance": "disk_white_bg",
      "width": 1000,
      "height": 999
    }
  ],

  "color_variants": [
    {
      "processed_path": "data/processed/storefront-assets/oliver/OL-07-1_color_leona_01.jpg",
      "color_hint": "leona",
      "source_provenance": "disk_white_bg"
    }
  ],

  "source_provenance": "disk_verified | legacy_fallback | pdf_temporary"
}
```

---

## Why seed.ts Should Still Wait

| Reason | Detail |
|--------|--------|
| **No production storage** | Processed files are local; Medusa needs stable URLs (S3/uploads) |
| **No entity mapping** | Workbook rows ≠ Medusa products yet; need Product/Variant/Collection schema |
| **58 items uncovered** | 4 collections have 0% processed coverage |
| **2 low-res images** | PV-14-1 and PV-68-1 need reshoot |
| **VV decision pending** | 48+ Willie Winkie items blocked |
| **Oxford at 0%** | Entire collection missing from processed layer |
| **Greenwich beds** | 5 items awaiting business confirmation |

### Minimum Prerequisites for seed.ts

1. Production storage configured (S3 bucket or Medusa uploads)
2. Image upload script that replaces local paths with production URLs
3. Medusa entity mapping (Product, Variant, Collection, Category)
4. At least Oliver + Provence + CLP fully uploaded
5. Decision on partial catalog launch vs full catalog requirement

---

## Recommended Binding Layer Task

When the time comes to build the binding layer:

1. Read `processed-assets.json` + `legacy-fallback-summary.json`
2. Group by `product_code_normalized`
3. Assign `main` → product thumbnail, `gallery` → additional images, `color_variant` → variant swatches
4. Cross-reference with `production-subset-skeleton.json` for workbook data
5. Output: `data/normalized/product-asset-binding.json`
6. This binding file becomes the input for seed.ts generation

**This task should happen after production storage is configured.**
