# Oxford-4 pilot — manual QA notes (governance)

**Pass type:** human QA record + repository-level verification in Cursor (no seed/validation/sync/runner; no evidence JSON edits).

**Baseline:** evidence `243d1d7`, final status `9969c40`, checklist `5c29cb2`. Oxford remains **pilot-only**, **PAUSED**, not storefront/media/white-background ready.

---

## Overall outcome

| Field | Value |
|-------|--------|
| **Manual QA status** | **needs follow-up** for live Medusa Admin / Store API row checks |
| **Repository governance checks** | **pass** (seed contract, static assets, storefront pause contract in source) |

**Reason live checks incomplete:** this pass did not log into Medusa Admin. A probe to `http://localhost:9000/store/products?handle=<handle>` returned **HTTP 400** for all four handles (wrong query contract for this Medusa build, backend down, or auth/region requirements). **Operator** should repeat checklist items 1–2 from `oxford-four-pilot-manual-qa-checklist.md` on the intended QA/staging backend.

---

## Per-handle matrix

| Handle | SKU | Live Admin / API (products, SKU, media URLs) | Repo: `seed-products.oxford-pilot-four.json` alignment | Repo: interim `*_interim_pdf_gallery_01.png` on disk |
|--------|-----|-----------------------------------------------|--------------------------------------------------------|--------------------------------------------------------|
| `ox-14-11` | `OX-14-11` | **needs follow-up** | **pass** (handle, SKU, title, CONFIGURABLE, `main_image_url` interim path) | **pass** |
| `ox-90-1` | `OX-90-1` | **needs follow-up** | **pass** | **pass** |
| `ox-14-1` | `OX-14-1` | **needs follow-up** | **pass** | **pass** |
| `s-ox-05` | `S-OX-05` | **needs follow-up** | **pass** | **pass** |

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

## Sign-off line

- **Governance / repo QA:** reviewed — seed + static + pause contract **pass**.  
- **Human live QA (Admin/API):** **pending** — operator to complete and optionally append dated subsection here or in a follow-up doc.
