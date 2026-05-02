# Oxford-4 pilot — manual QA notes (governance)

**Pass type:** human QA record + repository-level verification in Cursor (no seed/validation/sync/runner; no evidence JSON edits).

**Baseline:** evidence `243d1d7`, final status `9969c40`, checklist `5c29cb2`. Oxford remains **pilot-only**, **PAUSED**, not storefront/media/white-background ready.

---

## Overall outcome

| Field | Value |
|-------|--------|
| **Manual QA status** | **live_qa_pass** (local Store API; see dated block below). **Optional follow-up:** Medusa Admin UI on the same or other backends if governance requires a human Admin session. |
| **Repository governance checks** | **pass** (seed contract, static assets, storefront pause contract in source) |

**Earlier probe note (superseded for method, not for env scope):** `GET /store/products?handle=…` returned **HTTP 400** without `x-publishable-api-key` — Medusa requires that header; this project’s `GET /store/products` route also **does not** filter by `handle` (it lists **published** products only). Correct check: authorized Store `GET /store/products` and locate the four handles in the JSON (or Admin/API filtered query).

---

## Per-handle matrix

| Handle | SKU | Live Admin / API (products, SKU, media URLs) | Repo: `seed-products.oxford-pilot-four.json` alignment | Repo: interim `*_interim_pdf_gallery_01.png` on disk |
|--------|-----|-----------------------------------------------|--------------------------------------------------------|--------------------------------------------------------|
| `ox-14-11` | `OX-14-11` | **pass** (local Store API — see dated block) | **pass** (handle, SKU, title, CONFIGURABLE, `main_image_url` interim path) | **pass** |
| `ox-90-1` | `OX-90-1` | **pass** | **pass** | **pass** |
| `ox-14-1` | `OX-14-1` | **pass** | **pass** | **pass** |
| `s-ox-05` | `S-OX-05` | **pass** | **pass** | **pass** |

---

## Visual caveats (interim only)

- Per `oxford-four-pilot-visual-review-signoff`: `OX-14-11` / `OX-14-1` — **probable** visual match; `OX-90-1` / `S-OX-05` — **confirmed** at sign-off tier. **Not** white-background; lifestyle / PDF lane only.
- Shared `Oxford_full_p6_*` gallery context between `OX-14-1` and `OX-90-1` — pilot relies on **distinct** interim primary files, not filename tokens alone.

---

## Not a blocker for **pilot post-ingestion evidence** (already closed)

- Interim image quality vs marketing ideal — addressed under **interim_pilot_materialize** lane, not under evidence `verdict: ok`.
- Absence of live API confirmation in **this** document — evidence closure remains valid per committed validation JSON; this note only records **residual human QA** debt.

---

## Blockers for **full Oxford** readiness (unchanged)

1. White-background (or agreed commercial SoT) per policy.  
2. Coverage beyond four pilot SKUs + workbook alignment.  
3. Yandex / source mount and intake where required.  
4. Governance rollout matrix + explicit unpause decision.  
5. **No** `catalog-scope.ts` change until product approves — Oxford stays in `PAUSED_COLLECTION_KEYS` (verified read-only: `oxford` ∈ `PAUSED_COLLECTION_KEYS`, ∉ `ACTIVE_COLLECTION_KEYS`).

---

## Storefront scope (read-only verification)

- `apps/storefront/src/lib/catalog-scope.ts`: **`oxford` paused**; not in active set — consistent with post-ingestion evidence claims. **No publish** of Oxford in public catalog from this QA note.

---

## Live operator QA — dated record

### 2026-05-02T12:36:05Z — local Store API pass

| Field | Value |
|-------|--------|
| **Date/time (UTC)** | `2026-05-02T12:36:05Z` |
| **Environment** | Local Medusa backend `http://127.0.0.1:9000` (developer machine; same host as storefront `.env.local` backend URL). **Not** a claim about staging/production. |
| **Method** | **Store API** — `GET /store/products` with header `x-publishable-api-key` from local `apps/storefront/.env.local` (key not recorded in repo). **Medusa Admin UI** not used this pass. |
| **Final operator QA status** | **`live_qa_pass`** — four pilot products present in the published Store list with expected handles/SKUs/titles/classification/media URLs; interim primary PNGs return HTTP 200. Does **not** imply full Oxford collection readiness, media-final, white-background, or storefront unpause (see guardrails above). |
| **catalog-scope.ts** | Unchanged in git working tree this session; `oxford` remains **PAUSED** only (read-only confirmation aligns with pre-existing notes). |
| **Storefront publish** | No rollout/unpause performed as part of this QA. |

**Per-handle results**

| Handle | Found | Handle ↔ SKU | Title / identity | Media path (interim primary) | Image load (HEAD) | Caveats / follow-up |
|--------|-------|----------------|------------------|------------------------------|-------------------|----------------------|
| `ox-14-11` | yes | `OX-14-11` | Matches seed title / canonical_name | `…/static/products/oxford/ox-14-11_interim_pdf_gallery_01.png` | **200** | Interim / **not** white-background; gallery includes extra Oxford PDF extracts — expected. |
| `ox-90-1` | yes | `OX-90-1` | Matches seed (incl. spacing in title) | `…/ox-90-1_interim_pdf_gallery_01.png` | **200** | Interim only; shares `Oxford_full_p6_*` gallery assets with `ox-14-1` — pilot uses **distinct** interim primaries per visual signoff; not a SKU/handle mismatch. |
| `ox-14-1` | yes | `OX-14-1` | Matches seed | `…/ox-14-1_interim_pdf_gallery_01.png` | **200** | Same shared gallery context as `ox-90-1`; interim primary distinct — OK for pilot lane. |
| `s-ox-05` | yes | `S-OX-05` | Matches seed | `…/s-ox-05_interim_pdf_gallery_01.png` | **200** | Interim only; workbook had `dimensions_parse_failed` at source — still visible as governance context only. |

**Classification (Store payload):** all four rows report `product_classification.product_type` = **CONFIGURABLE** (matches seed).

**Residual (non-blocking for this pass):** repeat the same checklist against **staging/production** Medusa if product governance requires environment parity; optional **Admin UI** spot-check for operators who prefer visual confirmation of the same fields.

---

## Sign-off line

- **Governance / repo QA:** reviewed — seed + static + pause contract **pass**.  
- **Human live QA (Store API, local):** **pass** — dated block above (`live_qa_pass`). Optional: Admin UI / other environments per governance.
