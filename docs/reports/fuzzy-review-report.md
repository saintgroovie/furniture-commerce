# Fuzzy Review Report

Итоговый отчёт по controlled promotion of fuzzy matches.

---

## Overview

| Metric | Count |
|--------|-------|
| Fuzzy matches reviewed | **80** |
| Safely promoted | **22** (27.5%) |
| Remain fuzzy (need manual review) | **58** (72.5%) |
| Rejection reasons documented | **5 categories** |

---

## Promotion Breakdown

| Promotion Reason | Count | Confidence |
|-----------------|-------|-----------|
| `exact_name_match` | 6 | 0.85 |
| `detail_suffix_match` | 7 | 0.80 |
| `size_variant` (adjacent sizes) | 4 | 0.75 |
| `abbreviation_match` (0→О, Swarovski, etc.) | 3 | 0.85 |
| `name_subset_match` | 2 | 0.80 |

---

## Final Image Mapping Status (all 342 products)

| Status | Count | % |
|--------|-------|---|
| **verified** (code match) | 125 | 36.5% |
| **promoted** (safe fuzzy→verified) | 22 | 6.4% |
| **fuzzy** (needs manual review) | 58 | 17.0% |
| **missing** (no legacy match) | 74 | 21.6% |
| **blocked** (VV + no code) | 63 | 18.4% |

**Combined matched (verified + promoted): 147 / 342 = 43.0%**

---

## Collection Coverage After Promotion

| Collection | Total | Verified | Promoted | Fuzzy | Missing | Blocked | Matched% |
|-----------|-------|----------|----------|-------|---------|---------|----------|
| **oliver** | 71 | 57 | 4 | 6 | 4 | 0 | **86%** |
| **provence** | 35 | 20 | 7 | 7 | 1 | 0 | **77%** |
| **princess-rose** | 34 | 17 | 3 | 9 | 5 | 0 | **59%** |
| **monchelsea** | 67 | 27 | 5 | 28 | 3 | 4 | **48%** |
| **greenwich** | 15 | 0 | 3 | 7 | 5 | 0 | **20%** |
| **country-london-paris** | 30 | 4 | 0 | 1 | 25 | 0 | **13%** |
| **oxford** | 23 | 0 | 0 | 0 | 23 | 0 | **0%** |
| **accessories** | 8 | 0 | 0 | 0 | 8 | 0 | **0%** |
| **willie-winkie** | 59 | 0 | 0 | 0 | 0 | 59 | **0%** |

### Most improved by promotion

- **Provence:** 57% → 77% (+20pp, 7 promotions)
- **Oliver:** 80% → 86% (+6pp, 4 promotions)
- **Greenwich:** 0% → 20% (+20pp, 3 promotions — first verified-level matches)

---

## What Remains Unresolved

### By queue

| Queue | Count | Priority |
|-------|-------|----------|
| VV painting decision blocked | 59 | Critical (business) |
| Remaining fuzzy (manual review) | 58 | Medium |
| No legacy match (needs PDF) | 51 | High |
| Oxford absent (needs PDF) | 23 | High |
| Missing product code | 4 | Medium |
| **Total unresolved** | **195** | |

### Highest-priority unresolved source

**PDF catalog extraction** is now the single most impactful next step:

1. **Oxford (23 products, 0% coverage)** — Oxford.pdf, Oxford_full.pdf on Yandex Disk
2. **Country-London-Paris (25 missing)** — Country.pdf, London.pdf
3. **Greenwich (5 missing + 7 fuzzy)** — Greenwich.pdf would help confirm or reject fuzzy matches
4. **Monchelsea (3 missing + 28 fuzzy)** — Monchelsea.pdf could resolve wardrobe variants
5. **Princess Rose (5 missing)** — Princess Rose.pdf

PDF extraction would directly address **74 missing products** and help resolve **~35 of 58 fuzzy matches** via visual cross-reference.

---

## Recommendations

### Next step: PDF catalog extraction (highest ROI)

1. Download PDFs from Yandex Disk `/Каталоги/`
2. Extract pages as images
3. Match pages to products within same collection
4. Use extracted images for missing products
5. Use as cross-reference to confirm/reject remaining fuzzy matches

### Manual review for remaining 58 fuzzy

If PDF extraction is not immediate:
- Review `data/normalized/fuzzy-match-review.json` — each entry has rejection reason
- Visually confirm: does the legacy image match the workbook product?
- Focus on Monchelsea (28 items) and Princess Rose (9 items) — highest volume

### VV decision still blocking

59 products remain blocked. No progress possible without business decision on painting model.

---

## Why seed.ts Is Still Not Ready

| Reason | Impact |
|--------|--------|
| 147/342 matched (43%) | 57% of products have no confirmed image |
| 59 VV blocked | 17% awaiting business decision |
| 74 missing | Need PDF/manual images |
| 58 fuzzy unconfirmed | May be wrong matches |
| Oxford at 0% | Entire collection imageless |

Minimum threshold for seed.ts: all non-VV collections at ≥80% coverage with verified/promoted images.

---

## Architectural Safety Confirmed

- No backend code modified
- No storefront code modified
- No seed.ts updated
- No data imported into Medusa
- All 22 promotions follow documented rules in `fuzzy-promotion-rules.md`
- Every promotion has explicit `promotion_reason` and `promotion_evidence`
- Verified, promoted, and fuzzy remain clearly separated in output
