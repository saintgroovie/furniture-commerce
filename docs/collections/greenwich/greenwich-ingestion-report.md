# Greenwich Ingestion Report

Generated: 2026-03-19

---

## Summary

Greenwich pilot ingestion fully prepared. 15 products from workbook normalized into Medusa-compatible format with 290 asset references. All 193 processed image files deployed to `apps/backend/uploads/`. Seed script ready to execute. Zero validation errors.

**Status: ready to seed when Medusa server is running.**

---

## Created / Updated Files

| File | Purpose |
|------|---------|
| `docs/collections/greenwich/greenwich-ingestion-plan.md` | Ingestion strategy, data mapping, deployment steps |
| `data/normalized/greenwich-ingestion.json` | 15 products: identity, prices, dimensions, asset references |
| `data/normalized/greenwich-assets-ingestion.json` | 290 asset entries: storage keys, roles, tiers |
| `scripts/build-greenwich-ingestion.py` | Generator: workbook + processed assets → ingestion JSON |
| `scripts/seed-greenwich.ts` | Medusa v2 seed script (deploy to `apps/backend/src/scripts/`) |
| `scripts/deploy-greenwich-assets.py` | Copies processed files to Medusa uploads directory |
| `apps/backend/uploads/products/greenwich/` | 170 deployed image files |
| `apps/backend/uploads/products/greenwich/beds-shared/` | 23 deployed bed pool files |
| `docs/collections/greenwich/greenwich-ingestion-report.md` | This report |

---

## Greenwich Ingestion Model

### Products (15)

| Handle | SKU | Name | Category | Price (RUB) | Tier |
|--------|-----|------|----------|-------------|------|
| `greenwich-gr-09-1-mirror` | GR-09-1-M | Зеркало навесное | zerkala | 28,400 | temporary_pdf |
| `greenwich-gr-05-1` | GR-05-1 | Комод | komody | 109,500 | ready |
| `greenwich-gr-44-1` | GR-44-1 | Консоль | konsoli | 45,900 | ready |
| `greenwich-gr-67-1` | GR-67-1 | Рабочий стол | stoly | 77,650 | ready |
| `greenwich-gr-42-1` | GR-42-1 | Тумба ТВ | tumby | 68,800 | temporary_pdf |
| `greenwich-gr-08-1` | GR-08-1 | Прикроватная тумба с 2 ящиками | tumby | 36,500 | ready |
| `greenwich-gr-08-2` | GR-08-2 | Прикроватная тумба с 1 ящиком | tumby | 31,200 | ready |
| `greenwich-gr-26-1` | GR-26-1 | Шкаф-витрина Кристалл | shkafy | 146,650 | ready |
| `greenwich-gr-02-1` | GR-02-1 | Гардероб 2-х дв. с ящиками | shkafy | 169,200 | ready |
| `greenwich-gr-02-2` | GR-02-2 | Гардероб 2-дв. | shkafy | 167,450 | ready |
| `greenwich-gr-09-1-bed-90` | GR-09-1 | Кровать 1-сп. (90×200) | krovati | 71,900 | bed_shared_pool |
| `greenwich-gr-12-1` | GR-12-1 | Кровать 1,5-сп. (120×200) | krovati | 81,100 | bed_shared_pool |
| `greenwich-gr-14-1` | GR-14-1 | Кровать 1,5-сп. (140×200) | krovati | 89,700 | bed_shared_pool |
| `greenwich-gr-16-1` | GR-16-1 | Кровать 2-сп. (160×200) | krovati | 94,000 | bed_shared_pool |
| `greenwich-gr-18-1` | GR-18-1 | Кровать 2-сп. (180×200) | krovati | 110,400 | bed_shared_pool |

### Categories

| Handle | Name | Status |
|--------|------|--------|
| `stoly` | столы | Existing |
| `tumby` | тумбы | Existing |
| `shkafy` | шкафы | Existing |
| `krovati` | кровати | New |
| `zerkala` | зеркала | New |
| `komody` | комоды | New |
| `konsoli` | консоли | New |

### Price Source

All prices from workbook `price_normalized`. Converted to kopeks (×100) for Medusa. Currency: `rub`. No legacy or PDF prices used.

### Dimensions

Stored in product `metadata.dimensions` as `{height_mm, width_mm, depth_mm}`. Source: workbook `dimensions_normalized`.

### Product Type

All set to `STANDARD` (safe default). Can be updated to `CONFIGURABLE` for beds if headboard selection becomes a checkout option.

---

## Asset Handling Model

### URL Pattern

```
http://localhost:9000/uploads/products/greenwich/{filename}
```

Configurable via `MEDUSA_BACKEND_URL` environment variable.

### Image Assignment

| Tier | Products | Thumbnail | Gallery | Total refs |
|------|----------|-----------|---------|------------|
| Ready | 8 | Own main image | 15–24 product images | 168 |
| Bed shared pool | 5 | Frame main (shared) | 23 pool images (shared) | 120 |
| Temporary PDF | 2 | PDF extract (temp) | None | 2 |
| **Total** | **15** | **15** | **275** | **290** |

### Bed Pool

- 5 beds share identical 23-image gallery (Frame, Cloud, Plane designs)
- Thumbnail: `GR-BED-POOL_frame_01.jpg` for all 5 beds
- Images stored once in `beds-shared/`, referenced by all bed products
- Product identity remains separate (different price, dimensions, handle, SKU)

### Temporary PDF

- `GR-09-1_temp_main_01.png` (mirror) — `_temp_` infix in filename
- `GR-42-1_temp_main_01.png` (TV stand) — `_temp_` infix in filename
- Product metadata includes `asset_quality: "temporary_pdf"`
- No gallery images available

### GR-09-1 Duplicate Code

| | Mirror | Bed |
|---|--------|-----|
| Handle | `greenwich-gr-09-1-mirror` | `greenwich-gr-09-1-bed-90` |
| SKU | `GR-09-1-M` | `GR-09-1` |
| Thumbnail | `GR-09-1_temp_main_01.png` | `beds-shared/GR-BED-POOL_frame_01.jpg` |
| Tier | temporary_pdf | bed_shared_pool |

Zero collision risk. Different handles, SKUs, and image paths.

---

## Validation Results

| Check | Result |
|-------|--------|
| Handles unique (15) | PASS |
| SKUs unique (15) | PASS |
| Prices in range (1K–500K RUB) | PASS |
| Dimensions present (15/15) | PASS |
| Thumbnails present in uploads (15/15) | PASS |
| Gallery files present in uploads (183 unique) | PASS |
| GR-09-1 disambiguated | PASS |
| Bed pool shared correctly (5 products × 23 images) | PASS |
| Temp PDF marked (2/2) | PASS |
| Categories complete (7) | PASS |
| **Total errors** | **0** |
| **Total warnings** | **0** |

---

## Remaining Caveats

1. **Seed script not yet deployed** — `scripts/seed-greenwich.ts` must be copied to `apps/backend/src/scripts/` and executed with running Medusa server
2. **Existing demo data** — 15 demo products from `seed.ts` coexist. No conflict (different handles/SKUs)
3. **Temporary PDF (2 items)** — GR-09-1 mirror and GR-42-1 TV stand need production photography
4. **Product type** — All set to STANDARD; beds may need CONFIGURABLE if headboard selection becomes checkout option
5. **Room Sets** — Greenwich Room Sets not created in this pilot (separate task)
6. **GR-09-1 code** — Business should assign unique code to mirror or bed
7. **Image serving** — Local file storage adequate for dev/staging; S3+CDN needed for production

---

## Deployment Sequence

```
# 1. Assets already deployed
python3 scripts/deploy-greenwich-assets.py  ← DONE (193 files)

# 2. Deploy seed script
cp scripts/seed-greenwich.ts apps/backend/src/scripts/

# 3. Run seed (requires running Medusa + Postgres)
cd apps/backend
npx medusa exec ./src/scripts/seed-greenwich.ts
```

---

## Greenwich Readiness After Ingestion

| Phase | Status |
|-------|--------|
| Legacy scrape | Done (11 pages) |
| Image mapping | Done (15/15 products) |
| Manual review | Done (beds resolved, PDF accepted) |
| Raw download | Done (193 files) |
| Preprocess | Done (193 storefront-ready files) |
| Ingestion data | Done (15 products, 290 refs) |
| Asset deployment | Done (193 files in uploads) |
| Seed execution | Ready (pending server) |
| **Storefront visibility** | **Ready after seed** |

Greenwich is the first collection to reach full ingestion-ready state.

---

## Recommended Next Step

1. **Run seed** — start Medusa server, execute `seed-greenwich.ts`
2. **Verify in Admin** — check 15 products appear with images in Medusa Admin
3. **Verify in Storefront** — confirm products render with thumbnails and gallery
4. **Replicate for other collections** — use same pipeline (Oliver, Provence, etc.)
