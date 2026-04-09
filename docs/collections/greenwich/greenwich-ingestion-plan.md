# Greenwich Ingestion Plan

Controlled pilot for seeding Greenwich products into Medusa backend.

---

## Scope

- 15 Greenwich workbook products only
- Workbook is sole source of truth for identity, prices, dimensions
- Processed assets referenced via storage keys (uploaded separately)
- Does not modify existing seed.ts or existing demo products
- Separate `seed-greenwich.ts` script, deployable when approved

---

## Product Representation

### Data Source Mapping

| Field | Source | Example |
|-------|--------|---------|
| `title` | workbook `product_name_canonical` | "Комод" |
| `handle` | derived: `greenwich-{code_lower}` | `greenwich-gr-05-1` |
| `sku` | workbook `product_code_normalized` | `GR-05-1` |
| `description` | collection label + canonical name | "Greenwich — Комод" |
| `price` | workbook `price_normalized` × 100 (kopeks) | 10950000 |
| `status` | always `published` | — |
| `product_type` | `STANDARD` (safe default) | — |

### Handle Disambiguation for GR-09-1

Since `GR-09-1` maps to both a mirror and a bed:

| Product | Handle | SKU |
|---------|--------|-----|
| Зеркало навесное (row 6) | `greenwich-gr-09-1-mirror` | `GR-09-1-M` |
| Кровать 1-сп. (row 16) | `greenwich-gr-09-1-bed` | `GR-09-1` |

The mirror gets the suffix because the bed is the "primary" use of the code in the workbook.

---

## Categories

### Existing Categories (reuse)

| Workbook cat | Medusa handle | Medusa name |
|-------------|---------------|-------------|
| table | `stoly` | столы |
| nightstand | `tumby` | тумбы |
| wardrobe | `shkafy` | шкафы |

### New Categories (create)

| Workbook cat | Medusa handle | Medusa name |
|-------------|---------------|-------------|
| bed | `krovati` | кровати |
| mirror | `zerkala` | зеркала |
| dresser | `komody` | комоды |
| console | `konsoli` | консоли |

---

## Prices and Dimensions

- **Prices:** from workbook `price_normalized` field (in rubles). Converted to kopeks (×100) for Medusa variant pricing. Currency: `rub`.
- **Dimensions:** from workbook `dimensions_normalized`. Stored as product metadata (height_mm, width_mm, depth_mm). Medusa products support `metadata` JSON field.
- **No legacy/PDF prices or dimensions used.**

---

## Asset Attachment

### URL Pattern (MVP/dev)

```
{ASSET_BASE_URL}/uploads/products/greenwich/{filename}
```

- `ASSET_BASE_URL` defaults to `http://localhost:9000` in development
- Storage keys follow `products/greenwich/{filename}`

### Image Fields in Medusa Product

| Medusa field | Source | Example |
|-------------|--------|---------|
| `thumbnail` | main image URL | `/uploads/products/greenwich/GR-05-1_main_01.jpg` |
| `images[]` | gallery URLs | `[{url: ".../GR-05-1_gallery_01.jpg"}, ...]` |

### Ready Items (8 products)

Each product has a dedicated main image and 15–24 gallery images. URLs point to `data/processed/storefront-assets/greenwich/{filename}`.

### Shared Bed Pool (5 products)

All 5 bed products share the same 23-image pool from `beds-shared/`:

| Medusa field | Value |
|-------------|-------|
| `thumbnail` | `GR-BED_frame_01.jpg` (Frame representative) |
| `images[]` | All 23 pool images from `beds-shared/` |

This means all 5 beds display the same gallery. Storefront can filter by `design_family` metadata if needed.

### Temporary PDF Items (2 products)

| Product | Thumbnail | Gallery |
|---------|-----------|---------|
| GR-09-1 (mirror) | `GR-09-1_temp_main_01.png` | None |
| GR-42-1 (TV stand) | `GR-42-1_temp_main_01.png` | None |

These use `_temp_` infix filenames. Product metadata includes `asset_quality: "temporary_pdf"` flag.

---

## GR-09-1 Duplicate Code Safety

| Aspect | Mirror (row 6) | Bed (row 16) |
|--------|---------------|-------------|
| Handle | `greenwich-gr-09-1-mirror` | `greenwich-gr-09-1-bed` |
| SKU | `GR-09-1-M` | `GR-09-1` |
| Thumbnail | `GR-09-1_temp_main_01.png` | `beds-shared/GR-BED_frame_01.jpg` |
| Asset tier | temporary_pdf | bed_shared_pool |

Two distinct Medusa products. No collision in handles, SKUs, or image paths.

---

## Pre-requisites Before Running Seed

1. **Upload images:** Copy processed assets to Medusa uploads directory:
   - `data/processed/storefront-assets/greenwich/*.jpg` → `apps/backend/uploads/products/greenwich/`
   - `data/processed/storefront-assets/greenwich/beds-shared/*.jpg` → `apps/backend/uploads/products/greenwich/beds-shared/`
2. **Deploy script:** Copy `scripts/seed-greenwich.ts` to `apps/backend/src/scripts/`
3. **Run:** `npx medusa exec ./src/scripts/seed-greenwich.ts`

---

## What the Seed Script Does NOT Do

- Does not modify existing products or demo data
- Does not create Room Sets (Greenwich room sets are out of scope for this pilot)
- Does not upload images (separate step)
- Does not modify storefront code
- Does not touch non-Greenwich categories/products
