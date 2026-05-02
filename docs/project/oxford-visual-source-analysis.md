# Oxford visual source analysis

Pass type: **source inventory + candidate mapping + reviewer packet** (governance-only).  
Not seed, ingestion, validation, sync, media readiness, or rollout.

## Verdict

**PARTIAL: YANDEX ROOT NOT MOUNTED**

Expected Yandex Disk white-background mirrors were **not found** on the machine where this pass ran:

- `/WOODRIGHT/Контент /Фото на белом фоне` — missing  
- `/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне` — missing  
- `/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне` — missing  

This analysis therefore relies on **repo-local** trees, `data/raw/front/front-manifest.json`, and normalized evidence references. It does **not** fabricate Disk file listings.

**Next step to lift PARTIAL:** mount or sync Yandex Disk so the above roots exist, then re-run a read-only harvest (this inventory can be regenerated; do not treat current pass as full Oxford white-background coverage).

---

## Policy and scope inputs

Read and applied:

- `docs/guidelines/development-rules.md`
- `docs/architecture/architecture-guardrails.md`
- `docs/project/CODEMAP.md`
- `docs/project/visual-asset-source-priority-policy.md`
- `data/normalized/visual-asset-candidate-manifest.json`
- `docs/storefront/product-card-photo-ux-audit.md`
- `data/normalized/oxford-four-pilot-interim-asset-source-map.json` (read-only; **not modified**)

Oxford workbook scope: **23** rows with `collection_name_normalized: oxford` in `data/normalized/product-workbook-asset-map.json` (sheet ОКСФОРД, including SH-/MC-/Ox- lines on that sheet).

---

## Sources checked (exact)

| Path | Status |
|------|--------|
| `/WOODRIGHT/Контент /Фото на белом фоне` | missing |
| `/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне` | missing |
| `/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне` | missing |
| `data/raw/assets` | found — `find` for `*oxford*` / `*OX-*` at shallow depth: **0** matches |
| `data/raw/downloaded-assets` | found — same: **0** matches |
| `data/processed/storefront-assets` | found — same: **0** matches |
| `apps/backend/static/products/oxford` | found — **11** PNG files |
| `apps/backend/static/products` | found (parent of collection folders) |
| `data/raw/pdf-assets/extracted/Oxford_full` | found — **12** PNG files |
| `data/raw/front/front-manifest.json` | found — **7** rows with `collection_hint: oxford` (Oxford 1–7.jpg) |
| `data/processed/asset-manifests/disk-download-manifest.json` | scanned via grep for oxford/OX-: **no** hits in this workspace snapshot |

Additional governance manifests (context only, not mutated): `visual-source-inventory-index.json`, `oxford-four-pdf-seed-interim-candidates.json`, `seed-products.oxford-pilot-four.json`.

---

## Oxford visual inventory summary

Machine-readable inventory: `data/normalized/oxford-visual-source-inventory.json`.

| Metric | Value |
|--------|------:|
| Total candidate records | 30 |
| Confirmed (pilot-grade filename / binding) | 4 |
| Probable (page-level link, no SKU in filename) | 4 |
| Ambiguous (legacy collection photos, shared PDF crops, extra pages) | 22 |
| Rejected / not Oxford | 0 |
| Legacy front refs with **no** local binary in repo | 7 (`/WOODRIGHT/...` paths only in manifest) |

**White background:** no path in this pass is labeled white-background confirmed. Workbook asset map states Oxford Yandex assets behave as collection photos without per-SKU white-bg join on prior scans; with Disk unmounted, this pass **cannot** improve that.

---

## SKU mapping summary

Machine-readable map: `data/normalized/oxford-visual-candidate-map.json`.

| mapping_status | Count |
|----------------|------:|
| confirmed (Oxford-4 pilot only) | 4 |
| missing (other 19 workbook SKUs) | 19 |
| probable / ambiguous / blocked_by_source_confusion | 0 at SKU row level |

---

## Oxford-4 pilot visual status

Controlled pilot SKUs: `OX-14-11`, `OX-90-1`, `OX-14-1`, `S-OX-05`.

**Explicit non-readiness:** these sources are **not** media-ready, **not** storefront-ready, and **not** a signal to unpause Oxford. They are interim PDF-derived / static-backed candidates per existing pilot governance artifacts.

| SKU | Usable interim source present (local static) | Representative `source_path` | `source_type` | White vs non-white | Confidence | `interim_card_or_yandex_source` | Reviewer sign-off | Unblock `materialize-static` (files on disk) |
|-----|-----------------------------------------------|--------------------------------|---------------|-------------------|--------------|----------------------------------|-------------------|-----------------------------------------------|
| OX-14-11 | yes | `apps/backend/static/products/oxford/ox-14-11_interim_pdf_gallery_01.png` | backend_static | **non-white** (not validated as white-bg) | confirmed | yes (controlled pilot only) | recommended before any production use | **yes** — files exist under `apps/backend/static/products/oxford/` and PDF extract originals under `data/raw/pdf-assets/extracted/Oxford_full/` |
| OX-90-1 | yes | `apps/backend/static/products/oxford/ox-90-1_interim_pdf_gallery_01.png` | backend_static | non-white | confirmed | yes | recommended | **yes** |
| OX-14-1 | yes | `apps/backend/static/products/oxford/ox-14-1_interim_pdf_gallery_01.png` | backend_static | non-white | confirmed | yes | recommended | **yes** |
| S-OX-05 | yes | `apps/backend/static/products/oxford/s-ox-05_interim_pdf_gallery_01.png` | backend_static | non-white | confirmed | yes | recommended | **yes** |

**Warning (all four):** `Oxford_full_p6_*` crops are **shared** between OX-14-1 and OX-90-1 in gallery context; pilot mapping relies on controlled manifests (`oxford-four-pdf-seed-interim-candidates.json`, interim source map), not on filename alone.

`oxford-four-pilot-interim-asset-source-map.json` was **not** changed in this pass; materialize decisions remain governed by that file and operator process outside this inventory.

---

## Artifacts produced

- `data/normalized/oxford-visual-source-inventory.json`
- `data/normalized/oxford-visual-candidate-map.json`
- `docs/project/oxford-visual-review-packet.md` (reviewer grouping)
- `docs/project/CODEMAP.md` — links to the above only

---

## Safety statement

- No seed, validation, sync, or full runner executed.  
- `apps/storefront/src/lib/catalog-scope.ts` not modified.  
- `data/normalized/oxford-four-pilot-post-ingestion-validation.json` and `data/normalized/oxford-four-pilot-ingested-evidence.json` not modified.  
- No mass copy/rename of binaries; no raw assets staged for commit.  
- No false white-background claims.
