# Oxford-4 pilot — manual QA / evidence review checklist

Governance-only checklist. **No** seed/validation/sync/runner from this document; **no** `catalog-scope.ts` edits; **no** Oxford storefront publish or unpause.

---

## Evidence consistency (read-only review)

Cross-checked **2026-05-02** between:

| Source | Aligns on |
|--------|-----------|
| `docs/project/oxford-four-pilot-post-ingestion-final-status.md` | Runner OK; evidence commits `243d1d7` (main) / `9584213` (validation); pause + non-readiness |
| `data/normalized/oxford-four-pilot-post-ingestion-validation.json` | `verdict: ok`, `violations: []`, `storefront_pause_contract.ok: true`, four handles |
| `data/normalized/oxford-four-pilot-ingested-evidence.json` | Same four `medusa_handles` / workbook row keys; `post_ingestion_db_evidence: ok`; `not_storefront_rollout`, `not_full_oxford_rollout` |
| `docs/project/oxford-four-pilot-visual-review-signoff.md` (+ JSON) | Same four SKUs; `approved_for_interim_pilot` only; **not** white-background; **not** media/storefront/rollout approved |

**Note:** `handles_found` order may differ between JSON arrays; set equality is `{ox-14-11, ox-90-1, ox-14-1, s-ox-05}` everywhere.

---

## Pilot subset (verify in Admin / API)

**Handles:** `ox-14-11`, `ox-90-1`, `ox-14-1`, `s-ox-05`  
**SKUs:** `OX-14-11`, `OX-90-1`, `OX-14-1`, `S-OX-05`

### Manual checks (Medusa Admin or Store API against **non-production** DB as appropriate)

- [ ] Each handle exists as a **product**; titles/metadata match pilot seed intent (`seed-products.oxford-pilot-four.json` reference only — do not mutate).
- [ ] **Variant SKU** matches workbook code (`OX-*` / `S-OX-*`).
- [ ] **Images:** primary URLs point at interim static paths under `static/products/oxford/*_interim_pdf_gallery_01.png` (or equivalent); gallery entries match pilot manifest where applicable.
- [ ] **Product type** / classification (CONFIGURABLE per seed) visible and consistent.
- [ ] **Inventory / stock location** rows present for pilot SKUs if your QA profile expects sellable stock (optional smoke; do not re-run automated runner from this checklist alone).

### Visual match (human)

- [ ] Spot-check hero vs **canonical_name** per `oxford-four-pilot-visual-review-signoff` — sign-off is **interim / pilot only** (`probable` for `OX-14-11`, `OX-14-1`; `confirmed` for `OX-90-1`, `S-OX-05`).
- [ ] **Do not** label interim PNGs as **white-background** or catalog-final quality.

---

## Scope guardrails (must remain true)

- **Oxford remains PAUSED** on storefront (`storefront_pause_contract` in validation JSON; `claims.oxford_remains_paused_on_storefront` in ingested evidence).
- **Storefront publish** of Oxford in public catalog: **not allowed** from this pilot closure alone.
- **Interim images:** PDF/lifestyle lane — **not** `media_ready` / **not** `storefront_ready` / **not** `rollout_ready` (per visual signoff `not_approved_for`).

---

## Gates before full Oxford readiness (separate program)

1. Per-SKU **white-background** (or agreed commercial SoT) where required by policy.  
2. Workbook / entity coverage **beyond** the four pilot SKUs.  
3. **Yandex Disk** (or equivalent) source mount + intake for Oxford where applicable.  
4. **Governance matrix** / collection rollout checklist sign-off.  
5. Explicit **`catalog-scope`** change only after product decision — **never** as a side effect of pilot QA.  
6. Optional: dedicated **production** Medusa apply + smoke after all gates.

---

## References

- Final status: `docs/project/oxford-four-pilot-post-ingestion-final-status.md`
- Validation JSON: `data/normalized/oxford-four-pilot-post-ingestion-validation.json`
- Ingested evidence: `data/normalized/oxford-four-pilot-ingested-evidence.json`
- Visual signoff: `docs/project/oxford-four-pilot-visual-review-signoff.md`, `data/normalized/oxford-four-pilot-visual-review-signoff.json`
- Runner log (local): `/tmp/woodright-oxford-four-runner.log` (if still present on the machine that ran validation)
