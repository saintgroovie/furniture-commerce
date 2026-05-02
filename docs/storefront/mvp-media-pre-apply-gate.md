# MVP Media Pre-Apply Gate (CO-02-1)

## Short verdict

**Pre-apply verification passed** for **CO-02-1** as a **Class B** (`temporary_non_white_static_local`) candidate: local static source exists, identity is **confirmed**, executor dry-run shows **`apply_allowed_in_future: true`**, and the executor artifact lists **exactly one** eligible row (no surprise Class A or extra Class B). **No `--apply` was run** in this pass; no database or storefront changes.

Machine-readable output: [`data/normalized/storefront-mvp-media-pre-apply-gate.json`](../../data/normalized/storefront-mvp-media-pre-apply-gate.json).

## What was checked

- Alignment between [`storefront-mvp-media-assignment-executor-dry-run.json`](../../data/normalized/storefront-mvp-media-assignment-executor-dry-run.json) **`eligible_rows`** and [`storefront-mvp-media-assignment-dry-run.json`](../../data/normalized/storefront-mvp-media-assignment-dry-run.json) **DR-001** (verdict, assignment type, flags).
- [`storefront-mvp-best-available-media-map.json`](../../data/normalized/storefront-mvp-best-available-media-map.json) for **CO-02-1**: `identity_confidence: confirmed`, `mvp_usage_status: use_as_temporary_primary`, `needs_later_white_background_replacement: true`, same gallery path as executor.
- **On-disk existence** of `CO-02-1_gallery_01.jpg` under `apps/backend/static/products/country-london-paris/` at gate time.
- **Executor summary**: `eligible_white_background_v1_count: 0`, `eligible_temporary_non_white_static_local_count: 1` — no unexpected apply-ready rows.

## Why CO-02-1 is only temporary primary (not production-ready)

- **`production_media_claim: false`** in executor policy for this class: the hero is a **confirmed non-white** gallery JPEG, not a governed white-background catalog claim.
- **`requires_later_white_background_replacement: true`**: once Yandex/WOODRIGHT white-bg is mounted or a governed static white-bg exists, media should be replaced per MVP map / selection refresh rationale.
- **`proposed_assignment_type: temporary_primary_image`**: executor and dry-run both treat this as interim card/DB primary placement, not a final merchandising assertion.

## Environment variables for a future apply

1. **`MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1`** — required for any executor `--apply`.
2. **`MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1`** — required **in addition** for Class B rows; without it, temporary non-white eligible rows are skipped on apply even if dry-run eligible.

## What a future apply would write

- **Only** Medusa product fields **`thumbnail`** and **`images`** (per [`mvp-media-assignment-executor.md`](mvp-media-assignment-executor.md) and executor guardrails).

## What a future apply would not write

- No **metadata**, **stage**, or **readiness** mutations.
- No **`catalog-scope.ts`** or storefront runtime changes from this script path.
- No **new products**; no **Oxford / Monchelsea probable / WW / Oliver / blocked** promotions via this executor subset.

## Skipped / blocked rows (unchanged intent)

Mirrors executor **`skipped_rows`**: Oxford pilot assignments (`eligible_but_paused_scope`), Monchelsea probable and blocked SKUs, Willie Winkie, Oliver Kids insufficient evidence, non-pilot Oxford placeholder. See **`blocked_rows[]`** in the JSON artifact.

## Rollback / snapshot note

This pass is **evidence only**. If a future apply runs, rollback is **restore prior `thumbnail`/`images`** from a DB or admin snapshot taken immediately before apply; if apply never runs, rollback is a no-op.

## Explicit no-apply confirmation

This documentation pass did **not** run:

`MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1 yarn mvp-media-assignments -- --apply`

No product records were modified; no apply command was executed.
