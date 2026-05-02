# Oxford visual review packet

Governance-only grouping for human review. **Does not** authorize rollout, unpause, or production media assignment.

Related artifacts:

- `data/normalized/oxford-visual-source-inventory.json`
- `data/normalized/oxford-visual-candidate-map.json`
- `docs/project/oxford-visual-source-analysis.md`

---

## 1. Confirmed mappings (SKU-scoped, interim non-white)

**SKUs:** `OX-14-11`, `OX-90-1`, `OX-14-1`, `S-OX-05`

**What was confirmed (machine sense):** controlled pilot manifests (`oxford-four-pdf-seed-interim-candidates.json`, `visual-asset-candidate-manifest.json`, `seed-products.oxford-pilot-four.json`) align these SKUs with specific `*_interim_pdf_gallery_01.png` files under `apps/backend/static/products/oxford/`.

**What the reviewer must still do:** visual sign-off that the image matches the **canonical_name** for each SKU (name/image swap risk on PDF-derived material). Open side-by-side:

- `data/normalized/oxford-four-pdf-seed-interim-candidates.json` — entity row + `mapping_notes` / `oxford_promotion`
- `data/normalized/oxford-visual-candidate-map.json` — `candidate_images` and `warnings`
- On disk: `apps/backend/static/products/oxford/<handle>_interim_pdf_gallery_01.png` and relevant `Oxford_full_p*.png` gallery crops

**Why this is not “commercial white-background confirmed”:** sources are PDF extract / interim static; `white_background_source` is **unknown** / false for confirmed-white policy. Do not promote to white_background_confirmed without Disk or studio evidence.

---

## 2. Probable mappings

**SKU-level probable:** none beyond the four pilot rows (those are treated as **confirmed** for interim under existing governance).

**Asset-level probable (not SKU-autonomous):** inventory ids `oxvis_inv_bs_p4_i0`, `oxvis_inv_bs_p5_i0` (and PDF-path duplicates) — page-level association to `S-OX-05` and `OX-14-11` respectively in pilot docs only.

**Reviewer focus:** if pilot primary interim file were rejected, these would be fallback candidates — still requires human page-to-SKU judgment.

---

## 3. Ambiguous mappings

Includes:

- **Legacy front:** `Oxford 1.jpg` … `Oxford 7.jpg` in `data/raw/front/front-manifest.json` (`collection_hint: oxford`, `product_code_hint: null`). **Local binaries not in repo**; paths point to `/WOODRIGHT/...`.
- **Shared PDF crops:** `Oxford_full_p6_i0_887x614.png` and `Oxford_full_p6_i1_887x621.png` — used in multiple pilot rows; filename has **no** SKU.
- **Extra PDF pages:** `Oxford_full_p2_*`, `p3_*`, `p7_*`, `p9_*` — no pilot binding in committed manifests.

**What the reviewer must check:** whether any legacy JPEG or extra PDF page can be **deterministically** tied to a **single** workbook SKU without contradicting pilot mappings.

**Files to open:** `data/raw/front/front-manifest.json` (search `Oxford 1.jpg`), `data/normalized/oxford-visual-source-inventory.json` (filter `confidence: ambiguous`).

**Why not auto-confirmed:** no SKU token in filename; collection-level or page-level evidence only; possible name/image mismatch.

---

## 4. Missing images (workbook SKUs without local SKU-scoped file)

**SKUs (19):** `OX-90-2`, `OX-14-2`, `OX-90-3`, `OX-90-4`, `OX-84-2`, `OX-84-1`, `OX-08-1`, `S-OX-04`, `S-OX-03`, `S-OX-02`, `SH-99-1`, `SH-14-1`, `SH-84-2`, `SH-84-1`, `MC-99-1`, `MC-14-1`, `MC-84-2`, `MC-84-1`, `Ox-1-1-N`

**State:** no `apps/backend/static/products/oxford/<sku>` style asset and no committed mapping assigning Oxford_full pages to these codes.

**Reviewer / operator actions:** mount Yandex white-background tree; search Disk collection folders; or schedule controlled PDF/page review — **outside** this packet’s authority to auto-map.

---

## 5. AI / manual follow-up candidates

| Bucket | Action |
|--------|--------|
| Yandex not mounted | Mount/sync per `docs/project/oxford-visual-source-analysis.md` missing roots; re-run inventory. |
| 19 missing SKUs | Manual pairing or new photography; optional AI assist only with human SKU lock. |
| Shared `p6` crops | If pilot is expanded, resolve OX-14-1 vs OX-90-1 gallery semantics explicitly in a **new** governance manifest (do not edit evidence JSON by hand per project rules). |
| Legacy Oxford 1–7 | If used as interim reference, require per-SKU reviewer sign-off; treat as `legacy_reference_only`. |

---

## Packet integrity

- Does not edit `oxford-four-pilot-interim-asset-source-map.json` or post-ingestion evidence JSON.  
- Does not claim Oxford media-ready or storefront-ready.
