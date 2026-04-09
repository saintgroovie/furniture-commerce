# Greenwich Preprocess Report

Generated: 2026-03-19

---

## Summary

193 raw Greenwich assets processed into storefront-ready format. Zero failures, zero missing files, zero corrupt images. All 15 Greenwich workbook products are covered: 8 production-ready, 5 via shared bed pool, 2 as temporary PDF fallback.

---

## Processing Stats

| Metric | Value |
|--------|-------|
| Total processed files | 193 |
| Ready assets (8 products) | 168 |
| Bed shared pool assets | 23 |
| Temporary PDF assets | 2 |
| Main images | 10 |
| Gallery images | 160 |
| Shared pool images | 23 |
| Total output size | 25.57 MB |
| Output JPEG files | 191 |
| Output PNG files | 2 (temp PDF only) |
| Processing failures | 0 |
| Missing raw files | 0 |

---

## Per-Product Breakdown

| Code | Name | Tier | Main | Gallery | Total |
|------|------|------|------|---------|-------|
| GR-02-1 | Шкаф 2-дв | ready | 1 | 22 | 23 |
| GR-02-2 | Шкаф 3-дв | ready | 1 | 19 | 20 |
| GR-05-1 | Комод | ready | 1 | 15 | 16 |
| GR-08-1 | Тумба прикроватная 1 | ready | 1 | 20 | 21 |
| GR-08-2 | Тумба прикроватная 2 | ready | 1 | 21 | 22 |
| GR-26-1 | Стол письменный | ready | 1 | 24 | 25 |
| GR-44-1 | Полка навесная | ready | 1 | 19 | 20 |
| GR-67-1 | Стеллаж | ready | 1 | 20 | 21 |
| GR-09-1 | Зеркало навесное | temporary_pdf | 1 | 0 | 1 |
| GR-42-1 | Тумба ТВ | temporary_pdf | 1 | 0 | 1 |
| Bed pool | 5 кроватей (shared) | bed_shared_pool | — | — | 23 |
| **Total** | | | **10** | **160** | **193** |

---

## Output Structure

```
data/processed/storefront-assets/greenwich/
├── GR-02-1_main_01.jpg          ← production-ready main
├── GR-02-1_gallery_01.jpg       ← production-ready gallery
├── ...
├── GR-09-1_temp_main_01.png     ← temporary PDF (mirror)
├── GR-42-1_temp_main_01.png     ← temporary PDF (TV stand)
├── ...
└── beds-shared/
    ├── GR-BED-POOL_frame_01.jpg ← shared bed pool (Frame design)
    ├── GR-BED-POOL_cloud_09.jpg ← shared bed pool (Cloud design)
    ├── GR-BED-POOL_plane_16.jpg ← shared bed pool (Plane design)
    └── ...                      ← 23 files total
```

---

## Temporary PDF Handling

| Code | Product | Status | Format | Note |
|------|---------|--------|--------|------|
| GR-09-1 | Зеркало навесное | temporary_pdf | PNG | `_temp_` infix in filename |
| GR-42-1 | Тумба ТВ | temporary_pdf | PNG | `_temp_` infix in filename |

- PNG format preserved (no lossy re-encoding of PDF-extracted images)
- `_temp_` infix prevents confusion with production assets
- These must be replaced with production photography before launch

---

## Warnings

### Oversized Images (4)

| File | Product | Dimensions |
|------|---------|------------|
| GR-26-1_gallery_07.jpg | Стол письменный | 5281×3743 |
| GR-02-1_gallery_11.jpg | Шкаф 2-дв | 7176×3739 |
| GR-02-2_gallery_07.jpg | Шкаф 3-дв | 4446×6090 |
| GR-02-2_gallery_08.jpg | Шкаф 3-дв | 7176×3739 |

These are large panoramic/interior shots from the legacy site. They are valid images but may need resize before storefront upload to avoid bandwidth waste.

### Duplicate Hashes (3)

| File A | File B | Context |
|--------|--------|---------|
| GR-67-1_gallery_08.jpg | GR-26-1_gallery_08.jpg | Shared interior/diagram across products |
| GR-08-2_gallery_08.jpg | GR-BED-POOL_cloud_13.jpg | Nightstand gallery = bed cloud image |
| GR-08-2_gallery_09.jpg | GR-BED-POOL_cloud_14.jpg | Nightstand gallery = bed cloud image |

Duplicate hashes are expected: legacy site reused the same images across product pages. Both copies are kept (different product contexts). Not a data integrity issue.

---

## Duplicate Code GR-09-1

- **Mirror** (row 6): `GR-09-1_temp_main_01.png` — temporary PDF, in main folder
- **Bed** (row 16): referenced via `beds-shared/` pool — no GR-09-1 prefix in bed filenames
- **No filename collision** — different naming patterns ensure zero ambiguity
- Processed manifest uses compound key `(workbook_row_key, canonical_name)` for all entries

---

## Greenwich Readiness After Preprocess

| Tier | Products | Processed Files | Status |
|------|----------|-----------------|--------|
| Production-ready | 8 | 168 | Storefront-ready JPEG q85 |
| Bed shared pool | 5 | 23 | Storefront-ready JPEG q85 |
| Temporary PDF | 2 | 2 | Marked temporary, PNG preserved |
| **Total** | **15** | **193** | **All covered** |

**Greenwich is ready for first storefront/seed ingestion pass.**

13 of 15 products (87%) have production-quality imagery. The remaining 2 need production photography but have usable temporary placeholders.

---

## Remaining Caveats

1. **4 oversized images** — consider resizing to max 2000px for storefront upload
2. **3 cross-product duplicate images** — not harmful but could be deduplicated in storage
3. **2 temporary PDF products** — need production photography before launch
4. **Bed pool presentation** — storefront needs to handle shared imagery display (design family filtering optional)
5. **GR-09-1 duplicate code** — business team should assign unique code to mirror or bed

---

## What Needs to Happen Before Full Production

| Step | Status | Blocker |
|------|--------|---------|
| Raw asset download | Done | — |
| Preprocess to storefront format | Done | — |
| Oversized image resize pass | Optional | — |
| Production photography for 2 PDF items | Needed | Business/studio |
| Storefront seed integration | Next | Requires seed.ts update (separate task) |
| Unique code for GR-09-1 | Needed | Business decision |

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/collections/greenwich/greenwich-asset-preprocess-strategy.md` | Preprocessing rules and conventions |
| `scripts/preprocess-greenwich-assets.py` | Rerunnable preprocess pipeline |
| `data/processed/storefront-assets/greenwich/` | 170 ready + temp files |
| `data/processed/storefront-assets/greenwich/beds-shared/` | 23 shared bed pool files |
| `data/processed/asset-manifests/greenwich-processed-assets.json` | Per-file manifest (193 entries) |
| `data/processed/asset-manifests/greenwich-processed-summary.json` | Aggregate statistics |
| `data/processed/asset-manifests/greenwich-processed-warnings.json` | 7 warnings (4 oversized + 3 duplicates) |
| `docs/collections/greenwich/greenwich-preprocess-report.md` | This report |
