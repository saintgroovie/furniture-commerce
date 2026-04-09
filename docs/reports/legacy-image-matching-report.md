# Legacy Image Matching Report

Результаты скрапинга woodright.ru и first-pass matching с workbook.

---

## Scrape Coverage

| Metric | Value |
|--------|-------|
| Category pages scraped | 14 categories, 92 pages total |
| Total unique product pages | 1064 |
| Products with main image | 1063 (99.9%) |
| Products with article code from filename | 738 (69.4%) |
| Products without collection hint | 100 |
| Scrape warnings | 336 |

### Products by Collection (legacy site)

| Collection | Products | Notes |
|-----------|---------|-------|
| willie-winkie (VV paintings) | 772 | 73% of all legacy products — 18+ painting variants |
| oliver | 56 | Good coverage |
| monchelsea | 41 | Good — MN-prefix codes |
| princess-rose | 32 | Good |
| provence | 28 | Good — PV-prefix codes |
| greenwich | 11 | Name-based filenames, no article codes |
| molly-ru | 10 | Not in workbook (possibly old/separate) |
| country-london-paris | 5 | Low presence |
| molly | 4 | Not in workbook |
| black-isle | 3 | Not in workbook |
| eksklyuzivnye-predmety | 2 | Not in workbook |
| (no collection) | 100 | Tudor Oak, art, room pages |

---

## Matching Results

### Overall

| Status | Count | % of matchable |
|--------|-------|----------------|
| **Verified** (exact/normalized code) | 125 | 36.5% |
| **Fuzzy** (name match, needs review) | 80 | 23.4% |
| **Missing** (no match found) | 74 | 21.6% |
| **Blocked** (VV + no code) | 63 | 18.4% |
| **Total matchable** | **342** | 100% |

### Match Basis Breakdown

| Basis | Count | Confidence |
|-------|-------|-----------|
| `exact_code` | 98 | 0.9 |
| `normalized_code` (MNm→MN) | 27 | 0.85 |
| `name_in_collection` (exact name) | 15 | 0.7 |
| `fuzzy_name` (word overlap ≥50%) | 65 | 0.3–0.6 |
| `vv_blocked` | 59 | — |
| `missing_code` | 4 | — |
| `no_match` | 74 | 0.0 |

---

## Per-Collection Coverage

| Collection | Total | Verified | Fuzzy | Missing | Blocked | Coverage |
|-----------|-------|----------|-------|---------|---------|----------|
| **oliver** | 71 | 57 | 10 | 4 | 0 | **94%** |
| **provence** | 35 | 20 | 14 | 1 | 0 | **97%** |
| **monchelsea** | 67 | 27 | 33 | 3 | 4 | **90%** |
| **princess-rose** | 34 | 17 | 12 | 5 | 0 | **85%** |
| **greenwich** | 15 | 0 | 10 | 5 | 0 | **67%** |
| **country-london-paris** | 30 | 4 | 1 | 25 | 0 | **17%** |
| **oxford** | 23 | 0 | 0 | 23 | 0 | **0%** |
| **accessories** | 8 | 0 | 0 | 8 | 0 | **0%** |
| **willie-winkie** | 59 | 0 | 0 | 0 | 59 | **0%** (blocked) |

### Best Coverage

- **Provence** (97%) and **Oliver** (94%) — nearly complete.
  Most matches are `exact_code` — image filenames contain article codes that match workbook.

- **Monchelsea** (90%) — good, but 33 are fuzzy.
  Code normalization (MNm→MN) enabled 27 verified matches. Remaining 33 fuzzy need review.

### Worst Coverage

- **Oxford** (0%) — entirely absent from legacy site. Not a single product page found.
  Oxford requires PDF catalog extraction or manual photography.

- **Country-London-Paris** (17%) — only 5 products with recognizable codes.
  Most Country/London items have name-based image filenames.

- **Accessories** (0%) — accessories (curtains, pillows, decorative items) not found in category scrape.

---

## Key Failure Patterns

### 1. Name-based image filenames (Greenwich)
Greenwich products use descriptive filenames like `greenwich_cloud_natural_beige.jpg`.
No article code extraction possible. Matched only by product name → all fuzzy.

### 2. Oxford absent from legacy site
Zero product pages found. Possible explanations:
- Oxford is a newer collection not yet on legacy site
- Oxford uses different naming on legacy (not found by URL pattern matching)
- Oxford products exist under different categories not scraped

### 3. Country-London-Paris low presence
Only 5 products with CO-prefix codes found. The combined
collection may be split differently on legacy site.

### 4. VV painting expansion
772 of 1064 legacy products are VV painting variants.
Each of the 59 physical VV items exists in 13–19 painting variants.
All blocked until business decides on painting model.

### 5. Code prefix inconsistencies
- Workbook `MNm-xx-y` → Legacy `MN-xx-y` (normalized successfully)
- Workbook `WW-xx-y` → Legacy `BA-xx-y`, `RL-xx-y`, etc. (painting-specific, blocked)
- Workbook `GR-xx-y` → Legacy has no code in filename (name-only)
- Workbook `OX-xx-y` → Legacy has no products at all

---

## Unresolved Queues After Legacy Scrape

| Queue | Count | Action Required |
|-------|-------|-----------------|
| `vv_variant_decision_blocked` | 59 | Business decision on painting model |
| `ambiguous_name_match` | 80 | Manual review of fuzzy matches |
| `no_legacy_match_needs_pdf` | 51 | Extract from PDF catalogs |
| `legacy_only_product` | 45 | Legacy products not in workbook |
| `oxford_collection_absent` | 23 | PDF extraction required |
| `missing_product_code` | 4 | Get codes from business |

### What got resolved by scrape

Before scrape: 342 products with `missing` or `blocked` status.
After scrape:
- **125 resolved to verified** (code match)
- **80 resolved to fuzzy** (name match, needs review)
- **63 remain blocked** (VV + no code)
- **74 remain missing** (no match at all)

---

## Collections Needing PDF / Front Fallback

| Collection | Missing Products | PDF Available | Front Folder |
|-----------|------------------|---------------|--------------|
| oxford | 23 | Oxford.pdf, Oxford_full.pdf | — |
| country-london-paris | 25 | Country.pdf, London.pdf | — |
| greenwich | 5 | Greenwich.pdf | — |
| princess-rose | 5 | Princess Rose.pdf | — |
| oliver | 4 | Oliver.pdf, Oliver-full.pdf, Oliver-oak.pdf | — |
| monchelsea | 3 | Monchelsea.pdf | mn-color-* |
| accessories | 8 | — | — |
| provence | 1 | Provence White.pdf, Provence Dark.pdf | — |

---

## Architectural Safety

- **No backend code modified**
- **No storefront code modified**
- **No seed.ts updated**
- **No data imported into Medusa**
- All outputs are in `data/raw/legacy/` and `data/normalized/`
- Scraper uses local HTTP cache for rerunnability
- All legacy images marked as `is_verified: false` — none are final
- Prices and dimensions from legacy site are NOT extracted or used
