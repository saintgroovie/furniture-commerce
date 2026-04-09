# Product-Asset Binding Report

Отчёт о первом asset-to-product binding layer.

---

## Executive Summary

**109 products** получили binding к processed assets.
**81 fully ready**, **28 ready with caveats**, **233 excluded**.
3 коллекции полностью покрыты: Oliver (67), Provence (29), Country-London-Paris (13).

---

## Binding Coverage

| Collection | Bound | Ready | Caveat | Coverage |
|-----------|-------|-------|--------|----------|
| Oliver | 67 | 56 | 11 | **100%** |
| Provence | 29 | 23 | 6 | **100%** |
| Country-London-Paris | 13 | 2 | 11 | **100%** |
| Monchelsea | 0 | — | — | 0% |
| Princess Rose | 0 | — | — | 0% |
| Greenwich | 0 | — | — | 0% |
| Accessories | 0 | — | — | 0% |
| **Total** | **109** | **81** | **28** | **65%** |

### Asset Depth

| Metric | Count |
|--------|-------|
| Products with main image | 94 |
| Products with gallery | 76 (180 images) |
| Products with color variants | 28 (170 images) |
| Total processed files referenced | 444 |

---

## Quality Exceptions (28 items)

### By Category

| Flag | Count | Impact |
|------|-------|--------|
| `gallery_only` | 21 | No dedicated main; first gallery used — visually fine |
| `legacy_fallback` | 5 | Legacy site image, not white-bg — acceptable for MVP |
| `low_res_temporary` | 1 | PV-14-1 (522×532) — usable but suboptimal |
| `needs_reshoot` | 1 | PV-68-1 (225×287) — too small, needs replacement |

### Detailed Exceptions

**Gallery-only (21 items):**
These products have multiple gallery images from disk but none was designated as preferred main in the image map. The first gallery image is used as main — visually equivalent, no quality loss.

- 11 Country-London-Paris items (CO-02-1, CO-08-1, CO-14-2, CO-61-1, CO-62-1/2/3, CO-65-1/2, CO-66-1, CO-69-1)
- 8 Oliver items (OL-14-1, OL-21-1, OL-26-1/2, OL-56-1, OL-57-1, OL-65-1, OL-66-1)
- 2 Provence items (PV-15-2, PV-65-5)

**Legacy fallback (5 items):**
- OL-00-1 (Шкаф угловой) — 820×820, adequate
- OL-05-Н (Комод высокий) — 1200×1200, good
- OL-08-2 (Тумбочка с дверкой) — 1200×1200, good
- PV-16-1 (Кровать 1,5-сп.) — 1200×1200, good
- PV-17-1 (Кровать 2-сп.) — 1200×1200, good

**Low resolution (2 items):**
- PV-14-1 (522×532) — legacy screenshot, usable for MVP
- PV-68-1 (225×287) — too small, **must reshoot before launch**

---

## Excluded / Unready Items (233)

| Reason | Count | Resolution |
|--------|-------|-----------|
| `no_processed_assets` | 58 | Needs download/preprocess for remaining collections |
| `fuzzy_unconfirmed` | 52 | Manual review of fuzzy matches |
| `vv_painting_decision_pending` | 48 | Willie Winkie business decision |
| `pdf_unconfirmed` | 32 | Manual review of PDF candidates |
| `no_image_source` | 28 | No source found |
| `vv_base_image_only` | 15 | Base image exists but VV blocked |

---

## Remaining Blockers Before seed.ts

| Blocker | Status | Impact |
|---------|--------|--------|
| Production storage not configured | **Blocking** | Can't generate stable URLs |
| Local paths ≠ production URLs | **Blocking** | Binding layer uses local paths |
| 58 items without processed assets | Partial | 4 collections at 0% |
| VV business decision | Partial | 48+ items blocked |
| PV-68-1 needs reshoot | Minor | 1 item too low-res |
| Entity mapping not done | **Blocking** | Product/Variant/Collection schema |

### What Must Be Decided

1. **Production storage choice:** S3, MinIO, Medusa local uploads, or CDN?
2. **Upload pipeline:** How to transform local paths → public URLs?
3. **Partial launch scope:** Ship with 3 collections or wait for all 7+?
4. **VV painting decision:** Unlocks 48-63 Willie Winkie items
5. **Entity mapping approach:** Direct workbook→Medusa or intermediate model?

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/assets/product-asset-binding-strategy.md` | Binding layer design |
| `docs/reports/assets/product-asset-binding-report.md` | This report |
| `data/normalized/product-asset-binding.schema.json` | JSON Schema |
| `data/normalized/product-asset-binding.json` | 109 bound products |
| `data/normalized/product-asset-binding-summary.json` | Aggregate stats |
| `data/normalized/product-asset-quality-exceptions.json` | 28 quality exceptions |
| `data/normalized/product-asset-binding-excluded.json` | 233 excluded items |

---

## Recommended Next Step

1. **Configure production storage** — choose S3/MinIO/uploads, set up bucket
2. **Build upload script** — transform local processed paths → stable URLs
3. **Create entity mapping** — workbook rows → Medusa Products/Variants/Collections
4. **Generate seed.ts** — using binding layer + URL mapping as input
