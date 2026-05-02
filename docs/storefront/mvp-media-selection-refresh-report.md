# MVP media selection refresh report

## Short verdict

**Controlled selection refresh completed** on **2026-05-02** using visual inventory + candidate map evidence. **CO-02-1** primary selection moved from **unmounted WOODRIGHT white-bg** to a **verified local** `backend_static_existing` gallery JPEG. **No apply**, no DB, no storefront/catalog-scope/backend-module changes. **Executor (post-policy expansion):** dry-run now admits **class B** `eligible_temporary_local_visual_ready` rows into **`eligible_rows`** when local path exists; **`--apply`** for class B still requires **`MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1`** in addition to **`MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1`** (see `mvp-media-assignment-executor.md`).

---

## What changed in selection

| Area | Change |
|------|--------|
| `storefront-mvp-best-available-media-map.json` | **CO-02-1** only: `selected_primary_image_path_or_ref` → absolute path `.../CO-02-1_gallery_01.jpg`; type `backend_static_existing`; `mvp_usage_status` → `use_as_temporary_primary`; `needs_later_white_background_replacement` → **true**; `fallback_reason_if_not_white_background` populated; summary counts updated (0 white-bg rows in `products[]`). |
| `storefront-mvp-media-assignment-dry-run.json` | **DR-001** verdict → **`eligible_temporary_local_visual_ready`** (new); type `backend_static_existing`; path matches MVP map; eligibility rules text updated; summary `eligible_for_future_apply: 0`, `eligible_temporary_local_visual_ready: 1`. |
| Oxford / Monchelsea / blocked | **Unchanged** (same refs, same paused / probable / blocked semantics). |

---

## Refs that became locally resolvable

- **CO-02-1:**  
  `/Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend/static/products/country-london-paris/CO-02-1_gallery_01.jpg` — **exists** (`fs` / inventory verified).

---

## Refs that stayed blocked / non-apply

- **WOODRIGHT** canonical white-bg paths — roots still **missing** on this machine.
- **Monchelsea** `mnm-55-1` — still **probable** + human sign-off required; remains in `skipped[]` of assignment dry-run.
- **WW / Oliver Kids / non-pilot Oxford** — unchanged blocked / skipped rows.

---

## CO-02-1 — before / after

| Field | Before | After |
|--------|--------|--------|
| `selected_primary_image_path_or_ref` | `/WOODRIGHT/.../co-02-1-blue-i1.jpg` (not on disk) | Absolute `.../CO-02-1_gallery_01.jpg` (**on disk**) |
| `selected_primary_image_type` | `white_background` | `backend_static_existing` |
| `mvp_usage_status` | `use_as_primary` | `use_as_temporary_primary` |
| `fallback_reason_if_not_white_background` | `null` | Filled: white-bg unavailable until mount / governed `co-02-1-blue-i1.jpg` materialization |
| `dry_run_verdict` (assignment dry-run) | `eligible_for_future_apply` | **`eligible_temporary_local_visual_ready`** |

---

## Assignment dry-run (artifact)

File: `data/normalized/storefront-mvp-media-assignment-dry-run.json`

- **5** `dry_run_assignments` rows (4 Oxford paused-scope + 1 country temporary-local-ready).
- **`eligible_for_future_apply`:** **0** (no white-bg + resolvable path in that class after refresh).
- **`eligible_temporary_local_visual_ready`:** **1** (CO-02-1).

---

## Executor dry-run (artifact)

Command: `cd apps/backend && yarn mvp-media-assignments`

Re-run after `apply-mvp-media-assignments.ts` policy expansion: **CO-02-1** should appear in **`eligible_rows`** with `eligibility_class=temporary_non_white_static_local`, `apply_allowed_in_future=true` when the gallery JPEG path exists, plus row-level **`executor_policy`** markers. Oxford / Monchelsea / blocked rows remain in **`skipped_rows`** as before.

---

## Blocked / human review summary

- **Human review:** Monchelsea probable row unchanged.
- **Blocked:** WW, Oliver aggregate, Monchelsea missing rows, non-pilot Oxford — unchanged in `skipped[]`.
- **Planning-only ready:** CO-02-1 local static path for **temporary** MVP card narrative — **not** auto-apply via current executor.

---

## Explicit no-apply / no-runtime-change confirmation

- **`MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 yarn mvp-media-assignments -- --apply`** was **not** run.
- **No** product DB writes, metadata, stage promotion, **`catalog-scope.ts`**, storefront runtime, or backend **module** business logic changes.
- **No** asset copy/rename in this pass.
- **`git add -A`** was **not** run.

---

## Next safe apply gate (do not run until approved + policy aligned)

**Class A (white-background only):**

```bash
MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 yarn mvp-media-assignments -- --apply
```

**Class B (temporary local static, e.g. CO-02-1):**

```bash
MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1 yarn mvp-media-assignments -- --apply
```

**Precondition (white-bg path):** mount WOODRIGHT / materialize `co-02-1-blue-i1.jpg` and move DR-001 back to `eligible_for_future_apply` + `white_background` if you want class-A-only apply without `ALLOW_TEMPORARY_STATIC`.
