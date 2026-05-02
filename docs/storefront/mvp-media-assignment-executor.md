# MVP Media Assignment Executor

## Short Verdict

The executor reads `storefront-mvp-media-assignment-dry-run.json`, classifies `dry_run_assignments[]` into **eligible** vs **skipped**, runs **pre-apply source checks**, and writes `storefront-mvp-media-assignment-executor-dry-run.json`.

- **Default (no flags):** dry-run only — **no database writes**.
- **`--apply`:** writes **only** product `thumbnail` and `images` (no metadata, variants, prices, or new products). Requires **`MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1`**. **Temporary non-white local static** rows additionally require **`MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1`**.

## Eligible classes (dry-run)

### Class A — White-background (v1)

All must hold:

- `dry_run_verdict === eligible_for_future_apply`
- `identity_confidence === confirmed`
- `selected_primary_image_type === white_background`
- `collection_key !== oxford`
- `collection_status` does not match executor substring guards (paused stage, stage_0_excluded, blocked-by-painting, selective-backfill)
- **Pre-apply:** local path exists **or** valid `http(s)` URL

### Class B — Temporary non-white **local static** (controlled)

All must hold:

- `dry_run_verdict === eligible_temporary_local_visual_ready`
- `identity_confidence === confirmed`
- `selected_primary_image_type === backend_static_existing`
- `proposed_assignment_type === temporary_primary_image`
- `needs_later_white_background_replacement === true` (boolean on dry-run row)
- **Pre-apply:** **local filesystem path exists** (http(s) alone is **not** enough — `confirmed_local_static_only`)
- `collection_key !== oxford`
- Same `collection_status` guards as class A

Each class-B eligible row carries **`executor_policy`** on the row: `temporary_non_white_static_allowed`, `temporary_non_white_static_scope`, `production_media_claim: false`, `requires_later_white_background_replacement`.

Artifact root also includes **`temporary_non_white_static_policy`** (same markers + `apply_env_gate`).

## What the Executor Does

- Resolves input/output paths from `apps/backend` (overridable via `MVP_MEDIA_DRY_RUN_INPUT` / `MVP_MEDIA_EXECUTOR_OUTPUT`).
- Mirrors `skipped[]` from the source artifact into **skipped_rows**.
- Emits **`eligible_rows[]`** with `eligibility_class`: `white_background_v1` | `temporary_non_white_static_local`, plus summary counts (`eligible_white_background_v1_count`, `eligible_temporary_non_white_static_local_count`).

## What It Does Not Do

- Does not create products, change prices, metadata, collection readiness, or `catalog-scope.ts`.
- Does not unpause Oxford or treat `eligible_but_paused_scope` as apply-ready.
- Does not apply Monchelsea probable, Willie Winkie, Oliver Kids, or blocked rows.
- Does not write to the database without `--apply`.

## Dry-run Behavior

```bash
cd apps/backend && yarn mvp-media-assignments
```

Writes `storefront-mvp-media-assignment-executor-dry-run.json` with `dry_run_only: true`.

## Apply (`--apply`)

**Gates:**

1. `MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1`
2. Class B rows: `MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1` (otherwise temporary non-white eligible rows are **excluded** from DB writes even if `apply_allowed_in_future` is true)

```bash
MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 yarn mvp-media-assignments -- --apply
```

**Class A DB writes:** white_background + `eligible_for_future_apply` + path/URL check.

**Class B DB writes:** same mechanics (FILE upload for local paths, URL for http), but only when **both** env vars are set.

## Skipped Rows

See **`skipped_rows[]`**: non-matching assignments (e.g. Oxford `eligible_but_paused_scope`, wrong `dry_run_verdict`) plus mirrored upstream **skipped** entries.

## Oxford-4 Note

Oxford remains **out of scope** for both eligible classes (`collection_key === oxford` is always excluded).

## CO-02-1 Note

With selection refresh, CO-02-1 is typically **class B** (`eligible_temporary_local_visual_ready`, local `CO-02-1_gallery_01.jpg`). **Dry-run** shows it in **`eligible_rows`** when the file exists. **`--apply`** for that row requires **`MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1`** in addition to **`APPLY_CONFIRM=1`**.
