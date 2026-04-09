# PDF Fallback Extraction Report

Итоговый отчёт по PDF catalog extraction и PDF-to-workbook matching.

---

## Overview

| Metric | Value |
|--------|-------|
| PDFs processed | **9** (Oxford ×2, Country, London, Greenwich, Monchelsea, Princess Rose, Oliver, Provence White) |
| Total assets extracted | **382** |
| Product candidates | **188** |
| Catalog pages rendered | **110** |
| Catalog elements (small/decorative) | **84** |
| Extraction warnings | **0** |
| Unique workbook matches | **61** |
| Missing items resolved | **42** |
| Fuzzy items strengthened | **20** |

---

## Coverage Progression

| Stage | Matched | Total | Coverage |
|-------|---------|-------|----------|
| After legacy scrape (verified) | 125 | 342 | 36.5% |
| After fuzzy promotion (+promoted) | 147 | 342 | 43.0% |
| **After PDF fallback (+pdf_candidate)** | **189** | **342** | **55.3%** |

**Coverage gain from PDF: +12.3 percentage points (+42 products)**

---

## Final Image Mapping Status

| Status | Count | % |
|--------|-------|---|
| **verified** (legacy code match) | 125 | 36.5% |
| **promoted** (safe fuzzy→verified) | 22 | 6.4% |
| **pdf_candidate** (PDF fallback) | 42 | 12.3% |
| **fuzzy** (needs manual review) | 58 | 17.0% |
| **missing** (no source found) | 32 | 9.4% |
| **blocked** (VV decision) | 63 | 18.4% |

---

## Collection Coverage After PDF

| Collection | Total | Verified | Promoted | PDF | Fuzzy | Missing | Blocked | Matched% | Change |
|-----------|-------|----------|----------|-----|-------|---------|---------|----------|--------|
| **oliver** | 71 | 57 | 4 | 2 | 6 | 2 | 0 | **89%** | +3pp |
| **oxford** | 23 | 0 | 0 | 18 | 0 | 5 | 0 | **78%** | **+78pp** |
| **provence** | 35 | 20 | 7 | 0 | 7 | 1 | 0 | **77%** | +0pp |
| **princess-rose** | 34 | 17 | 3 | 3 | 9 | 2 | 0 | **68%** | +9pp |
| **country-london-paris** | 30 | 4 | 0 | 14 | 1 | 11 | 0 | **60%** | **+47pp** |
| **greenwich** | 15 | 0 | 3 | 5 | 7 | 0 | 0 | **53%** | **+33pp** |
| **monchelsea** | 67 | 27 | 5 | 0 | 28 | 3 | 4 | **48%** | +0pp |
| **willie-winkie** | 59 | 0 | 0 | 0 | 0 | 0 | 59 | **0%** | +0pp |
| **accessories** | 8 | 0 | 0 | 0 | 0 | 8 | 0 | **0%** | +0pp |

### Most improved by PDF extraction

- **Oxford: 0% → 78%** (+78pp, 18 products — from zero to near-complete)
- **Country-London-Paris: 13% → 60%** (+47pp, 14 products from 2 PDF catalogs)
- **Greenwich: 20% → 53%** (+33pp, 5 products — all missing items found)

---

## Oxford Coverage Detail

18 of 23 Oxford items now have PDF candidate imagery. Remaining 5:

| Code | Name | Reason for gap |
|------|------|---------------|
| MC-14-1 | Комплекс Мой замок (кровать) | Separate product line, no catalog on disk |
| MC-99-1 | Комплекс Мой замок (без кровати) | Separate product line |
| SH-14-1 | Комплекс Милый дом (кровать) | Separate product line, no catalog on disk |
| SH-99-1 | Комплекс Милый дом (без кровати) | Separate product line |
| Ox-1-1-N | Съемный чехол | Textile accessory, not in furniture catalog |

Oxford-prefix items (OX-*) are **100% covered** by PDF. Only cross-listed items from Мой замок / Милый дом remain.

---

## PDF Match Quality

| Match Reason | Count | Avg. Confidence |
|-------------|-------|----------------|
| `oxford_page_hint` | 18 | 0.55 |
| `substring` | 12 | 0.50–0.58 |
| `exact_normalized` | 9 | 0.70 |
| `word_overlap` | 8 | 0.50 |
| `greenwich_map` | 7 | 0.70 |
| `greenwich_bed` | 4 | 0.50 |
| `collection_extra` | 3 | 0.60 |

All PDF matches have `mapping_status: pdf_candidate` — **none are marked as verified**. Human review is required before storefront use.

---

## Where PDF Was Insufficient

| Area | Issue |
|------|-------|
| **Monchelsea** | 28 fuzzy items got PDF evidence but zero new matches (products are modular variants not distinguishable by name alone) |
| **Accessories** | No PDF catalogs for accessories (sундуки, шкатулки, подушки) |
| **Willie Winkie** | Entirely VV-blocked, no PDF processing attempted |
| **Country shelf/detail products** | Полка в шкаф, Полка в столы — internal components not shown in catalog |
| **Article codes** | Zero article codes found in PDF text — all matching is name-based |

---

## Remaining Unresolved Queues

| Queue | Count | Priority |
|-------|-------|----------|
| VV variant decision blocked | 63 | Critical (business) |
| Remaining fuzzy (manual review) | 58 | Medium |
| PDF candidates (need human review) | 42 | Medium |
| Still missing after PDF | 32 | Low (mostly accessories / detail parts) |
| Missing product code | 4 | Low |
| **Total unresolved** | **199** | |

### VV decision still blocking

59 Willie Winkie + 4 Monchelsea VV items remain blocked. No progress possible without business decision on painting model.

---

## Extracted Assets Location

```
data/raw/pdf-assets/
├── source-pdfs/          # 9 downloaded PDFs
├── extracted/            # 272 embedded images (188 product_candidate)
│   ├── Oxford/           # 10 images
│   ├── Oxford_full/      # 12 images
│   ├── Country/          # 17 images
│   ├── London/           # 24 images
│   ├── Greenwich/        # 20 images
│   ├── Monchelsea/       # 50 images
│   ├── Princess_Rose/    # 48 images
│   ├── Oliver/           # 64 images
│   └── Provence_White/   # 27 images
├── pages/                # 110 rendered pages (200 DPI)
└── manifests/
    ├── pdf-asset-manifest.json     (382 entries)
    ├── pdf-asset-summary.json
    └── pdf-extraction-warnings.json (0 warnings)
```

---

## Biggest Risks

1. **PDF images are NOT verified** — all 42 matches are `pdf_candidate` status. Catalog images often show products in context (room shots, multi-product compositions), not clean product cutouts.
2. **Oxford images are complex-level** — the Oxford PDF shows a modular furniture complex, not individual products. Multiple workbook rows share the same visual.
3. **Name-based matching only** — zero article codes found in PDFs. All matching relies on product name similarity, which can produce false positives for variant-heavy collections.
4. **Greenwich beds share images** — 3 bed designs (Cloud, Plane, Frame) are mapped to 5+ size variants each. The actual bed images may not distinguish sizes.
5. **Quality variance** — embedded images range from 200×200 to 1700×1300 px. Smaller images may be insufficient for storefront use.

---

## Recommended Next Step

### Option A: Front/ folder review (highest remaining ROI)

The Yandex Disk `Front/` folder contains named product images (e.g., `G503-pvw.jpg`, `L386.jpg`) that may provide clean product shots for remaining missing items. This is the cheapest next step — images are already named with potential article codes.

### Option B: Manual review of 42 PDF candidates

Review `data/normalized/pdf-fallback-review.json` and visually confirm:
- Does the PDF image match the workbook product?
- Is the image quality sufficient for storefront use?
- Can specific products be cropped from catalog pages?

### Option C: Manual review of 58 remaining fuzzy

Review `data/normalized/fuzzy-match-review.json` (20 now have PDF evidence) — visual comparison with PDF catalog pages can confirm or reject matches.

### VV decision needed

Business decision on painting model unlocks 63 products (18.4% of catalog). Until then, Willie Winkie stays at 0%.

---

## Architectural Safety Confirmed

- No backend code modified
- No storefront code modified
- No seed.ts updated
- No data imported into Medusa
- All 42 PDF matches marked as `pdf_candidate` — never `verified`
- PDF evidence attached separately for 20 fuzzy items — their status stays `fuzzy`
- Extracted assets, candidate matches, and verified matches clearly separated
- VV blocked cases isolated from pipeline
