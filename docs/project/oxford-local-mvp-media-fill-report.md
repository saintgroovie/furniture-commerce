# Oxford local MVP media fill — report (local dev only)

**Pass type:** read-only harvest + machine-readable plan + Store API probe + QA route. **Not** production rollout, **not** full Oxford readiness, **not** white-background readiness, **not** unpause of Oxford in public catalog.

**Generated (artifact timestamps):** see `audit_meta.generated_at` inside `data/normalized/oxford-local-mvp-media-inventory.json` (re-run: `node scripts/build-oxford-local-mvp-media-artifacts.mjs` from repo root, or `yarn oxford-local-mvp-media:build` from `apps/backend`).

---

## Verdict

**`local_mvp_plan_ready`** — Oxford-related media on disk and in legacy manifests are consolidated into `oxford-local-mvp-media-inventory.json`; workbook-aligned SKU rows and candidate attachments are in `oxford-local-mvp-sku-media-candidate-map.json`; an HTTP-static–based assignment plan exists in `oxford-local-mvp-media-assignment-plan.json`. **Dry-run apply snapshot** is in `oxford-local-mvp-media-apply-result.json` with `local_apply_status: dry_run_completed_no_db_writes` when Store API is reachable (publishable key in local `.env.local`). **No Medusa DB mutation** was executed in the pass that produced this report.

---

## Sources scanned

| Source | Result |
|--------|--------|
| Yandex white-bg mirrors (3 roots) | `source_not_mounted` on the host used for the last build |
| `apps/backend/static/products/oxford` | OK — primary Oxford static + PDF materializations |
| `apps/backend/static/products` (filtered) | OK — Oxford-related filenames under sibling collection trees |
| `apps/backend/uploads/products` | OK if directory exists |
| `data/raw/assets`, `data/raw/downloaded-assets`, `data/processed/storefront-assets` | Scanned (Oxford-named hits typically 0) |
| `data/raw/pdf-assets/extracted/Oxford_full` | OK — PDF extract PNGs |
| `data/raw/pdf-assets/manifests`, `data/processed/asset-manifests` | Shallow scan for Oxford-related image paths |
| `data/raw/front/front-manifest.json` | Oxford `collection_hint: oxford` rows ingested as **manifest-only** refs (Disk paths; no local binary unless synced separately) |
| Prior governance inventory | Merged read-only from `data/normalized/oxford-visual-source-inventory.json` (not modified) |

**No** source files were deleted, renamed, or moved.

---

## Counts (last successful build)

| Metric | Approx. value | Artifact |
|--------|---------------|----------|
| Total `inventory_records` | 37 | `oxford-local-mvp-media-inventory.json` |
| Workbook Oxford SKU rows | 23 | `product-workbook-asset-map.json` → reflected in plan rows |
| Rows with product in **local** Medusa Store list | 4 | assignment plan + Store probe |
| Rows `product_missing_for_media_assignment` | 19 | plan (`apply_skip_reason: product_missing_for_local_medusa`) |
| Plan rows `local_mvp_apply_allowed` | 4 | pilot four only, when DB + HTTP primary exist |
| Flattened per-SKU `candidates[]` entries (with duplication across SKUs for shared PDFs) | 16 | sku map |
| Match tiers (flattened candidates) | `confirmed_existing_interim_map` ×4, `pdf_page_level_probable` ×4, `ambiguous_visual_review_needed` ×8 | sku map |
| Confidence (flattened) | confirmed ×4, probable ×4, ambiguous ×8 | sku map |
| Repo paths present in inventory but **not** attached to any SKU candidate row | ~18 | heuristic gap — mostly ambiguous/unscoped pool or duplicate static/pdf paths |

---

## Oxford SKU / media coverage

- **Identity:** workbook `medusa_handle_candidate` + `oxford-visual-candidate-map.json` + pilot seed for four SKUs.
- **Local Medusa:** only **four** pilot products exist in the probed Store API response; other workbook SKUs are recorded as **`product_missing_for_media_assignment`** (no auto-create per governance).
- **Primary policy in plan:** confirmed interim static (`*_interim_pdf_gallery_01.png`) preferred over PDF page crops for the four in-DB SKUs.
- **Shared PDF page `Oxford_full_p6_*`:** duplicated into **`gallery_review_backlog_urls`** for `OX-90-1` and `OX-14-1` as **ambiguous** (human review before treating as canonical gallery).

---

## Assignment / apply result

| Stage | Status |
|-------|--------|
| Build script (inventory + plan + dry-run snapshot) | **Executed** — JSON artifacts updated |
| `medusa exec` apply (`oxford-local-mvp-media-apply.ts`) | **Not executed** in this pass |
| `OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM=1` DB write | **Optional** — see backend `package.json` script `oxford-local-mvp-media:apply` |

`oxford-local-mvp-media-apply-result.json` holds **before / after would-be** snapshots for each plan row (no DB writes from the build script).

---

## QA preview

| Item | Location |
|------|----------|
| **Route** | `/qa/oxford-local-mvp-media` — `apps/storefront/src/app/qa/oxford-local-mvp-media/page.tsx` |
| **Data** | Reads `oxford-local-mvp-media-assignment-plan.json` from disk; fetches Store products when publishable key + backend URL are configured |
| **Scope** | Dev/QA only; Oxford remains **PAUSED** in `catalog-scope.ts` (unchanged) |

---

## Manual correction workflow (plan vs Store)

Use this table when adjusting **Medusa gallery assignment** later (meaning: remove URL from product `images` in Admin/API — **not** delete files from disk).

| SKU | Handle | Current primary (Store, if any) | Plan primary | Gallery (plan) | Questionable / backlog | Suggested action |
|-----|--------|----------------------------------|----------------|----------------|-------------------------|------------------|
| OX-14-11 | ox-14-11 | interim (Store) | interim (plan) | +1 probable PDF URL | — | keep |
| OX-90-1 | ox-90-1 | interim | interim | — | 2× `Oxford_full_p6_*` in `gallery_review_backlog_urls` | needs_manual_review for p6 sharing |
| OX-14-1 | ox-14-1 | interim | interim | — | 2× `Oxford_full_p6_*` backlog | needs_manual_review |
| S-OX-05 | s-ox-05 | interim | interim | +1 `Oxford_full_p4_i0` probable | — | keep / optional move_to_other_sku if product team disagrees with p4 binding |
| Other workbook SKUs | various | — | null | — | no local product | product_missing — create only under separate governed ingestion |

---

## Safety / non-claims

- **Local dev / MVP preview only** — do not present as production media rollout.
- **Interim / PDF / legacy** assets are **not** asserted as white-background.
- **Oxford-4 pilot evidence JSON** was **not** modified (`oxford-four-pilot-post-ingestion-validation.json`, `oxford-four-pilot-ingested-evidence.json`, etc.).
- **`catalog-scope.ts`** was **not** modified; Oxford stays out of active storefront scope.
- **No seed / validation / sync / Oxford pilot runner** was executed as part of this lane.

---

## Next manual cleanup step

1. Open **`/qa/oxford-local-mvp-media`** locally and visually confirm pilot four rows vs Store thumbnails.  
2. Resolve **`gallery_review_backlog_urls`** for `OX-90-1` / `OX-14-1` (p6) in Admin: assign to gallery, move to another SKU, or leave out of product media until white-bg or SKU-specific stills exist.  
3. If DB should match the plan’s HTTP URLs exactly, run (when you explicitly choose to):  
   `OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM=1 yarn oxford-local-mvp-media:apply -- --apply` from `apps/backend`, then re-verify in Admin.
