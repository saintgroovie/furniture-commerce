# Greenwich Seed Execution Report

Generated: 2026-03-19

---

## Summary

Greenwich pilot seed executed successfully. 15 real products from the workbook are now live in Medusa with imagery, prices, dimensions, and proper categorization. All validation checks passed. Zero errors.

---

## Execution Steps Performed

### 1. Pre-run Safety Check

| Check | Result |
|-------|--------|
| Docker containers running | medusa_backend, medusa_postgres, medusa_storefront, medusa_redis — all healthy |
| Medusa API health | `GET /health` → `OK` |
| Processed assets in uploads | 170 files + 23 beds-shared |
| Ingestion JSON accessible | Copied to `apps/backend/data/greenwich/` (Docker volume) |
| Existing products baseline | 15 demo products, no handle conflicts |

### 2. Adaptation Required

**Issue:** Medusa local file provider serves from `/static/` not `/uploads/`. Docker volume mount only covers `apps/backend/` → `/server/`.

**Actions taken:**
- Copied processed assets to `apps/backend/static/products/greenwich/` (Medusa's expected static directory)
- Updated `buildImageUrl()` in seed script: `/uploads/` → `/static/`
- Copied `greenwich-ingestion.json` to `apps/backend/data/greenwich/` (inside Docker volume)
- Updated `loadIngestionData()` to try container-local path first

### 3. Seed Execution

```
npx medusa exec ./src/scripts/seed-greenwich.ts
```

**Output:**
- 4 new categories created: кровати, зеркала, комоды, консоли
- 3 existing categories reused: столы, тумбы, шкафы
- 15 products created via `createProductsWorkflow`
- All category links established
- All product classifications set (STANDARD)
- Inventory configured at stock location "Основной склад"
- Execution time: ~92 seconds

---

## Files Touched

| File | Action | Purpose |
|------|--------|---------|
| `apps/backend/src/scripts/seed-greenwich.ts` | Created | Seed script (adapted for Docker paths) |
| `apps/backend/data/greenwich/greenwich-ingestion.json` | Created | Product data inside Docker volume |
| `apps/backend/static/products/greenwich/` | Created | 170 storefront-ready image files |
| `apps/backend/static/products/greenwich/beds-shared/` | Created | 23 bed pool image files |
| `apps/backend/uploads/products/greenwich/` | Exists | Original deployment (not used by Medusa, kept for reference) |

**Not touched:**
- `apps/backend/src/scripts/seed.ts` — original demo seed, untouched
- `apps/storefront/` — no changes
- `apps/backend/src/modules/` — no changes
- `apps/backend/src/api/` — no changes

---

## Seed Result

### Products Created: 15

| Handle | SKU | Title | Category | Price (₽) | Images | Tier |
|--------|-----|-------|----------|-----------|--------|------|
| greenwich-gr-09-1-mirror | GR-09-1-M | Зеркало навесное | зеркала | 28,400 | 0+thumb | temporary_pdf |
| greenwich-gr-05-1 | GR-05-1 | Комод | комоды | 109,500 | 15+thumb | ready |
| greenwich-gr-44-1 | GR-44-1 | Консоль | консоли | 45,900 | 19+thumb | ready |
| greenwich-gr-67-1 | GR-67-1 | Рабочий стол | столы | 77,650 | 20+thumb | ready |
| greenwich-gr-42-1 | GR-42-1 | Тумба ТВ | тумбы | 68,800 | 0+thumb | temporary_pdf |
| greenwich-gr-08-1 | GR-08-1 | Тумба 2 ящика | тумбы | 36,500 | 20+thumb | ready |
| greenwich-gr-08-2 | GR-08-2 | Тумба 1 ящик | тумбы | 31,200 | 21+thumb | ready |
| greenwich-gr-26-1 | GR-26-1 | Шкаф-витрина | шкафы | 146,650 | 24+thumb | ready |
| greenwich-gr-02-1 | GR-02-1 | Гардероб 2-дв. с ящ. | шкафы | 169,200 | 22+thumb | ready |
| greenwich-gr-02-2 | GR-02-2 | Гардероб 2-дв. | шкафы | 167,450 | 19+thumb | ready |
| greenwich-gr-09-1-bed-90 | GR-09-1 | Кровать 90×200 | кровати | 71,900 | 23+thumb | bed_shared_pool |
| greenwich-gr-12-1 | GR-12-1 | Кровать 120×200 | кровати | 81,100 | 23+thumb | bed_shared_pool |
| greenwich-gr-14-1 | GR-14-1 | Кровать 140×200 | кровати | 89,700 | 23+thumb | bed_shared_pool |
| greenwich-gr-16-1 | GR-16-1 | Кровать 160×200 | кровати | 94,000 | 23+thumb | bed_shared_pool |
| greenwich-gr-18-1 | GR-18-1 | Кровать 180×200 | кровати | 110,400 | 23+thumb | bed_shared_pool |

### Categories Created: 4 new + 3 reused

| Handle | Name | Status |
|--------|------|--------|
| krovati | кровати | NEW |
| zerkala | зеркала | NEW |
| komody | комоды | NEW |
| konsoli | консоли | NEW |
| stoly | столы | Existing |
| tumby | тумбы | Existing |
| shkafy | шкафы | Existing |

---

## Verification Results

### Data Layer (API + Database)

| Check | Result |
|-------|--------|
| 15 Greenwich products present | PASS |
| Handles unique (15/15) | PASS |
| SKUs unique (15/15) | PASS |
| All 15 have thumbnails | PASS |
| Prices in expected range (2.84M–16.92M kopeks) | PASS |
| GR-09-1 disambiguated (mirror vs bed) | PASS |
| All 5 beds share 23-image gallery | PASS |
| Temp PDF mirror: thumb with `_temp_`, 0 gallery | PASS |
| Temp PDF TV stand: thumb with `_temp_`, 0 gallery | PASS |
| 7 categories assigned correctly | PASS |
| Dimensions in metadata (height/width/depth_mm) | PASS |
| Collection tag in metadata (`greenwich`) | PASS |
| Asset tier in metadata | PASS |

### Asset Linkage

| Check | Result |
|-------|--------|
| 193 unique asset URLs | PASS |
| All 193 URLs return HTTP 200 | PASS |
| Thumbnails accessible (15/15) | PASS |
| Gallery images accessible (275 refs → 183 unique) | PASS |
| Bed pool images served from `/static/products/greenwich/beds-shared/` | PASS |
| Temp PDF images served correctly (PNG format) | PASS |

### Storefront / API Smoke

| Check | Result |
|-------|--------|
| Store API returns 30 products (15 demo + 15 Greenwich) | PASS |
| Storefront `/catalog` → 200 | PASS |
| Storefront `/product/greenwich-gr-05-1` → 200 | PASS |
| Storefront `/product/greenwich-gr-14-1` → 200 | PASS |
| Product detail includes title, price, metadata | PASS |

---

## Remaining Caveats

1. **Static vs Uploads directory** — Medusa v2 local file provider uses `/static/`, not `/uploads/`. The `deploy-greenwich-assets.py` script and `scripts/seed-greenwich.ts` (project root copy) still reference `/uploads/`. Updated copies in `apps/backend/` use `/static/`.
2. **Temporary PDF items (2)** — GR-09-1 mirror and GR-42-1 TV stand have placeholder images only. Need production photography.
3. **Product type** — All set to STANDARD. Beds may become CONFIGURABLE if headboard selection is offered.
4. **GR-09-1 duplicate code** — Business should assign unique code to mirror or bed. Currently handled via SKU suffix (GR-09-1-M).
5. **Demo products coexist** — 15 original demo products are still in the database. They don't conflict but should be cleaned up before production.
6. **Admin access** — Admin UI at `http://localhost:9000/app` requires login to visually verify products.
7. **Room Sets** — Greenwich Room Sets not created (out of scope for this pilot).
8. **Storefront image rendering** — Images are referenced in product data and all URLs resolve, but client-side rendering in the storefront should be visually verified via browser.

---

## Is Greenwich a Viable Reference Pattern?

**Yes.** The full pipeline is validated end-to-end:

```
workbook → scrape → mapping → download → preprocess → ingestion JSON → asset deploy → seed → Medusa DB → API → storefront
```

| Stage | Validated |
|-------|-----------|
| Data normalization (workbook → JSON) | Yes |
| Asset pipeline (raw → processed → deployed) | Yes |
| Seed script (JSON → Medusa products) | Yes |
| Image serving (static files → HTTP 200) | Yes |
| API response (correct data, images, prices) | Yes |
| Storefront pages (render, 200 status) | Yes |
| Duplicate code handling (GR-09-1) | Yes |
| Shared imagery (bed pool) | Yes |
| Temporary fallback marking (PDF items) | Yes |

**This pipeline can be replicated for Oliver, Provence, and other collections.**

---

## Recommended Next Steps

1. **Visual verification** — Open `http://localhost:8000/catalog` and a few product pages in browser to confirm images render correctly
2. **Admin verification** — Check products in `http://localhost:9000/app` (Medusa Admin)
3. **Clean demo data** — Remove 15 original demo products when ready
4. **Replicate for Oliver** — Apply same pipeline (already has processed assets)
5. **Replicate for Provence** — Apply same pipeline
6. **Production photography** — Schedule for GR-09-1 mirror and GR-42-1 TV stand
7. **Production storage** — Configure S3 + CDN when preparing for launch
