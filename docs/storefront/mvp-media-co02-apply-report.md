# MVP Media Apply Report — CO-02-1

## Short verdict

**Controlled apply completed successfully** for **CO-02-1** (`handle` **co-02-1**): Medusa **`thumbnail`** and **`images`** were updated to the FILE-module URL for **`CO-02-1_gallery_01.jpg`**. Executor artifact shows **`dry_run_only: false`**, **`apply_attempts`** length **1**, **`apply_summary.errors: 0`**. No other products received apply attempts.

## Command executed

```bash
cd apps/backend && MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1 yarn mvp-media-assignments -- --apply
```

### Implementation note (first attempt)

The first run in this session **failed before any DB write** with: `Trying to query by not existing property Product.sku` (Medusa v2 `listProducts` does not accept product-level `sku`). **`apply-mvp-media-assignments.ts`** was updated to load products by **`handle`** first and widen the scan when needed for variant-SKU matching. A **subsequent** run completed apply and regenerated [`storefront-mvp-media-assignment-executor-dry-run.json`](../../data/normalized/storefront-mvp-media-assignment-executor-dry-run.json).

## Affected product

| Field | Value |
|--------|--------|
| Dry-run SKU label | `CO-02-1` |
| Medusa `handle` | `co-02-1` |
| Medusa `id` | `prod_01KNTBXADAKWN6BXHSYFRX0R2F` |
| Class | `temporary_non_white_static_local` |

## Source image

- **Local file:** `apps/backend/static/products/country-london-paris/CO-02-1_gallery_01.jpg`
- **After FILE upload (Medusa static URL):** `http://localhost:9000/static/1777716293008-CO-02-1_gallery_01.jpg` (see executor `apply_attempts[0].target_url`)

## What was written

- **Only** product **`thumbnail`** and **`images`** (aligned with [`mvp-media-assignment-executor.md`](mvp-media-assignment-executor.md)).

## What was not written

- **No** commercial metadata, **no** collection stage/readiness, **no** `catalog-scope.ts`, **no** storefront source changes from this script, **no** new products.

## Skipped rows confirmation

Executor **`skipped_rows`** unchanged in role: **10** rows (Oxford paused-scope ×4, Monchelsea ×3, WW, Oliver, non-pilot Oxford). **`apply_attempts`** contains **only** CO-02-1 — no Oxford / Monchelsea / WW / Oliver / blocked apply.

## Apply evidence summary

From [`data/normalized/storefront-mvp-media-assignment-executor-dry-run.json`](../../data/normalized/storefront-mvp-media-assignment-executor-dry-run.json) after successful apply:

- `audit_meta.pass_kind`: `controlled_executor_apply`
- `dry_run_only`: **false**
- `apply_summary`: `attempted: 1`, `updated: 1`, `errors: 0`
- `apply_attempts[0].outcome`: `updated`, `detail`: `thumbnail_and_images_written`

Machine-readable twin: [`data/normalized/storefront-mvp-media-co02-apply-report.json`](../../data/normalized/storefront-mvp-media-co02-apply-report.json).

## Rollback / manual verification

- **Rollback:** restore prior **`thumbnail`** / **`images`** for product `co-02-1` from a DB backup or Admin snapshot taken before apply.
- **Verify:** Admin product media or Store API product by id; confirm first image URL matches uploaded static URL.

## Next safe QA step

Confirm **co-02-1** card/PDP in a **non-production** or **intended** environment if the product is already exposed in catalog; treat imagery as **temporary** until white-background replacement per MVP map. Do not broaden executor apply to other collections without a new pre-apply gate.
