# Greenwich Bed Display Audit

Generated: 2026-03-19

---

## Problem Statement

Greenwich beds appear as 5 visually identical cards in the catalog, each with the same thumbnail image but different size labels and prices. This creates a misleading impression of duplicate products.

---

## Current Data Model

5 separate Medusa products, one per workbook size row:

| Handle | Title | SKU | Price (₽) | Thumbnail | Gallery |
|--------|-------|-----|-----------|-----------|---------|
| greenwich-gr-09-1-bed-90 | Кровать 1-сп. (90×200) | GR-09-1 | 71,900 | GR-BED-POOL_frame_01.jpg | 23 shared |
| greenwich-gr-12-1 | Кровать 1,5-сп. (120×200) | GR-12-1 | 81,100 | GR-BED-POOL_frame_01.jpg | 23 shared |
| greenwich-gr-14-1 | Кровать 1,5-сп. (140×200) | GR-14-1 | 89,700 | GR-BED-POOL_frame_01.jpg | 23 shared |
| greenwich-gr-16-1 | Кровать 2-сп. (160×200) | GR-16-1 | 94,000 | GR-BED-POOL_frame_01.jpg | 23 shared |
| greenwich-gr-18-1 | Кровать 2-сп. (180×200) | GR-18-1 | 110,400 | GR-BED-POOL_frame_01.jpg | 23 shared |

**Key facts:**
- All 5 share **the same thumbnail** (Frame design main shot)
- All 5 share **the same 23 gallery images** (Frame + Cloud + Plane designs)
- Titles differ only by size suffix
- `metadata.asset_tier` = `"bed_shared_pool"` for all 5

---

## How Catalog Renders This

`/catalog` page → `getProducts()` → returns all 30 products → renders `ProductCard` per product.

`ProductCard` shows: `thumbnail` (image), `title` (text), `price` (number).

**Result:** 5 cards with:
- identical image
- titles like "Кровать 1-сп. (90×200)", "Кровать 1,5-сп. (120×200)", etc.
- different prices

To a customer, this looks like broken duplicates, not intentional size options.

---

## Root Cause

| Concept | Commercial Model (Workbook) | Merchandising Model (Customer View) |
|---------|---------------------------|--------------------------------------|
| Identity unit | Size-based row (1 row = 1 SKU = 1 price) | Design-based product (1 bed design = 1 browsable item) |
| What varies | Size → different price | Size → picker option within one product |
| What's constant | Collection, category | Image, design, description |

The ingestion pipeline correctly followed the workbook model (1 row → 1 Medusa product). But this commercial model doesn't match how furniture should be merchandised: customers browse by design, then pick a size.

---

## Impact

- **Catalog UX:** 5 near-identical cards waste space and confuse customers
- **SEO:** 5 pages with identical images and nearly identical titles → potential duplicate content
- **Conversion:** Customer may bounce thinking the catalog is broken
- **Scalability:** Same issue will recur for any collection with size-based workbook rows (Oliver beds, Willie Winkie, etc.)
