# MVP Media Source Contract (CO-02-1)

## Scope

- Collection: `country-london-paris`
- Product: `CO-02-1`
- Pass type: source availability check only (no apply)

## Canonical source ref

`/WOODRIGHT/Контент /Фото на белом фоне /country /co-02-1-blue-i1.jpg`

This exact ref is used consistently in:

- `data/normalized/storefront-mvp-media-assignment-dry-run.json`
- `data/normalized/storefront-mvp-media-assignment-executor-dry-run.json`
- `data/normalized/storefront-mvp-best-available-media-map.json`
- `data/normalized/visual-asset-candidate-manifest.json`
- `data/normalized/storefront-best-available-photo-candidates.json`
- `data/normalized/storefront-best-available-photo-approval-review.json`

## Availability checks

Checked roots:

- `/WOODRIGHT/Контент /Фото на белом фоне` -> not found
- `/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне` -> not found
- `/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне` -> not found
- `/Users/leonidmbp/Documents/projects/furniture-commerce/data/raw/downloaded-assets` -> exists (no `co-02-1-blue-i1.jpg`)
- `/Users/leonidmbp/Documents/projects/furniture-commerce/data/processed/storefront-assets` -> exists (no `co-02-1-blue-i1.jpg`)

Candidate file verdict:

- `/WOODRIGHT/Контент /Фото на белом фоне /country /co-02-1-blue-i1.jpg` -> not found locally

## Executor dry-run check

Command run:

`cd apps/backend && yarn mvp-media-assignments`

Observed for `CO-02-1`:

- `pre_apply=local_path_missing`
- `apply_allowed_in_future=false`

## Contract verdict

`source_mount_required`

## Post-`source_mount_required`: next safe step (operator choice)

This Cursor pass **did not** mount Yandex Disk and **did not** materialize bytes into `static/` (no confirmed `co-02-1-blue-i1.jpg` in the repo tree). Verdict stays **`source_mount_required`**; MVP dry-run / media-map refs are **unchanged** (no fictitious paths).

### Variant A — mount Yandex / WOODRIGHT (preferred when possible)

1. Mount or sync so the **canonical** file exists at:  
   `/WOODRIGHT/Контент /Фото на белом фоне /country /co-02-1-blue-i1.jpg`
2. Do **not** hand-edit controlled JSON to “fake” availability.
3. Run dry-run only: `cd apps/backend && yarn mvp-media-assignments`
4. Expect for `CO-02-1`: `pre_apply_source=local_path_exists` (or valid `http(s)` if you later switch ref in the governed lane) and `apply_allowed_in_future=true`.
5. Refresh `storefront-mvp-media-source-contract.json` / this doc with **measured** results only.

### Variant B — no mount, but confirmed bytes available

1. Operator supplies the **exact** file `co-02-1-blue-i1.jpg` (same asset as canonical Yandex path).
2. Place **only** that file at:  
   `apps/backend/static/products/country-london-paris/co-02-1-blue-i1.jpg`
3. In a **governed** follow-up (separate change), point controlled MVP media artifacts at the **existing** absolute static path so the executor’s `fs.existsSync` check passes.
4. Run dry-run only: `cd apps/backend && yarn mvp-media-assignments`
5. Confirm `apply_allowed_in_future=true`.

### Still blocked

If neither mount nor confirmed file bytes are available: **stop** — keep verdict `source_mount_required`, do not change dry-run eligibility manually.

---

**Last recheck (2026-05-02):** canonical path absent; repo-wide search found **no** `co-02-1-blue-i1.jpg`; executor dry-run still `local_path_missing` / `apply_allowed_in_future=false`.

**Post-operator verification pass (2026-05-02):** re-checked canonical path and `apps/backend/static/products/country-london-paris/co-02-1-blue-i1.jpg` — both absent; Variant **still_blocked**; governed ref alignment for B not run; `yarn mvp-media-assignments` dry-run unchanged for CO-02-1 (`apply_allowed_in_future=false`).

Required before governed apply:

1. Mount/sync WOODRIGHT source so this path exists locally:  
   `/WOODRIGHT/Контент /Фото на белом фоне /country /co-02-1-blue-i1.jpg`
2. Re-run only executor dry-run and verify `apply_allowed_in_future=true`.
3. Do not run `--apply` until explicit final approval.
