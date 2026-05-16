# Legacy media QA audit — Oxford & Monchelsea

**Pass kind:** read-only QA / dev board coverage (not production rollout, not Medusa apply).  
**Generated:** 2026-05-16 · `scripts/audit-legacy-media-oxford-monchelsea.mjs`  
**Machine-readable:** `data/normalized/legacy-media-oxford-monchelsea-audit.json`

---

## Sources checked

| Source | Role |
|--------|------|
| `data/normalized/legacy-media-inventory.json` | All repo-local + legacy front media rows |
| `data/normalized/legacy-media-product-candidate-map.json` | Per-row SKU/handle heuristic + Oxford visual overlay |
| `data/normalized/legacy-media-board-products.json` | **QA product index** (seed + workbook Oxford/Monchelsea; does not mutate `seed-products.json`) |
| `data/normalized/seed-products.json` | Baseline seeded collections (no Oxford/Monchelsea rows) |
| `data/normalized/seed-products.oxford-pilot-four.json` | Pilot-four handles + interim image URLs |
| `data/normalized/entity-mapping.json` | Oxford promoted entities (9 rows) |
| `data/normalized/product-workbook-asset-map.json` | Oxford 23 + Monchelsea 67 workbook SKUs |
| `data/normalized/oxford-local-mvp-sku-media-candidate-map.json` | Controlled page-level → SKU map for PDF crops |
| `data/normalized/oxford-visual-candidate-map.json` | Governance visual grouping (pilot + ambiguous) |
| `data/normalized/monchelsea-manual-identity-closure-backlog.json` | 26 manual identity rows (governance) |
| `data/raw/legacy/cache/*.html` | Legacy site PDP/listing cache (article index; no swatch misuse on listings) |
| `/qa/legacy-media-assignment-board` | Dev UI + export JSON |

**Not touched:** Medusa DB, seed mutation, catalog-scope, evidence JSON, executor/apply, rollout status.

---

## Collection summary

| Collection | Products (board index) | Media rows | Previewable | Confirmed | Ambiguous | Unpreviewable | Safe (sidebar) | Identity review |
|------------|---------------------:|-----------:|------------:|----------:|----------:|--------------:|---------------:|------------------:|
| **Oxford** | 23 | 37 | 30 | 9 | 21 | 7 | 9 | 21 |
| **Monchelsea** | 63 | 88 | 71 | 0 | 71 | 17 | 0 | 71 |

Sidebar **safe** / **identity** badges count candidate-map rows with `confirmed` vs `ambiguous` for that collection (see board UI `data-collection-safe-candidates` / `data-collection-needs-identity-review`).

---

## Oxford

### Findings

- **37** inventory rows under `apps/backend/static/products/oxford/` and related paths (`collection_hint: oxford`).
- **9 confirmed** matches: SKUs in filenames (`ox-14-11_interim_pdf_gallery_01.png`, pilot-four handles) + **6 rows** upgraded via `oxford-local-mvp-sku-media-candidate-map` overlay (`qa_overlay` field).
- **21 ambiguous**: shared `Oxford_full_p*` PDF page crops without per-SKU filename tokens; multiple workbook SKUs share page-level images (expected — operator must not auto-confirm without identity review).
- **7 unpreviewable**: path refs without local preview in this environment.
- **0** top candidates assigned to a non-Oxford collection after rebuild (no cross-collection leakage in matcher top slot).

### Safe match examples

| File | Top candidate | Basis |
|------|---------------|--------|
| `ox-14-11_interim_pdf_gallery_01.png` | `ox-14-11` / OX-14-11 | exact sku_hint + handle in filename |
| `ox-14-1_interim_pdf_gallery_01.png` | `ox-14-1` | pilot seed basename match |
| `Oxford_full_p5_i0_947x949.png` | `ox-14-11` | `oxford_local_mvp_map:pdf_page_level_probable` |

### Needs identity review examples

| File | Why |
|------|-----|
| `Oxford_full_p6_i0_887x614.png` | Shared across OX-14-1 / OX-90-1 gallery in pilot map — ambiguous page-level |
| `Oxford_full_p4_i0_1306x951.png` | Collection-only hint; no SKU token |

### Board visibility

- Collection filter **oxford** lists **23 products** (workbook + entity-mapping + pilot-four).
- Media pool shows **37** rows when filtered; suggestions use `suggestion-product-guard` — color-only rows **excluded** from safe suggestions.
- Governance: Oxford remains **paused**; this audit does not imply storefront or rollout readiness.

---

## Monchelsea

### Findings

- **88** inventory rows (`Monchelsea_p*` PDF extracts + any static paths).
- **17** rows with `sku_hint` / `handle_hint` (e.g. static filenames if present); most PDF crops have **no SKU in filename**.
- Matcher assigns **collection_hint_match** across **63** workbook SKUs → **ambiguous** (correct: must not auto-assign by color/collection alone).
- **26** SKUs in `monchelsea-manual-identity-closure-backlog.json` remain **ambiguous_manual_review_required** — not closed by this pass.
- **0** confirmed safe auto-suggestions without SKU/handle evidence (by design).

### Needs identity review

| Pattern | Reason |
|---------|--------|
| `Monchelsea_p10_i0_678x415.png` | Page-level PDF crop; no MNm-* token |
| Any row with `identity_confidence: ambiguous` | Multiple Monchelsea products share collection-only score |

### Board visibility

- Collection filter **monchelsea** lists **63 products** (`medusa_handle_candidate` from workbook).
- Operator sees **71 identity** badge rows in sidebar; safe suggestions empty until SKU-level assignment.
- Empty/blocked state is **correct** — do not fake assignments.

---

## What changed (QA layer only)

1. **`scripts/build-legacy-media-board-products.mjs`** → `legacy-media-board-products.json` (seed + Oxford/Monchelsea workbook rows).
2. **`scripts/build-legacy-media-product-candidate-map.mjs`** — indexes board products; Oxford visual overlay from local MVP map.
3. **`api/products`** — serves board product index when present.
4. **Board UI** — Oxford/Monchelsea sidebar badges: **safe** / **identity** candidate counts.
5. **`scripts/audit-legacy-media-oxford-monchelsea.mjs`** — regenerates audit JSON.

Regenerate after data changes:

```bash
node scripts/build-legacy-media-board-products.mjs
node scripts/build-legacy-media-product-candidate-map.mjs
node scripts/audit-legacy-media-oxford-monchelsea.mjs
```

---

## Remains manual

- Monchelsea manual identity backlog (26 rows) and disk/Yandex source gaps.
- Oxford non-pilot SKUs without mounted white-background sources.
- Page-level PDF crops for both collections — assign in board export JSON only after operator review.
- Legacy PDP swatch/article enrichment for Monchelsea (cache may be sparse).

---

## Safety confirmation

- No Medusa DB writes, no seed edits, no catalog-scope, no evidence JSON mutation, no executor/apply.
- Export decisions shape unchanged; existing `localStorage` decisions not overwritten by this pass.
- Read-only normalized artifacts are QA inputs for `/qa/legacy-media-assignment-board` only.
