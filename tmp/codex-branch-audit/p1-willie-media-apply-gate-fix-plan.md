# P1 fix plan — Willie Winkie media apply gate

**File:** `apps/backend/src/scripts/apply-willie-winkie-flow-a-product-media.ts`
**Original finding:** `updateProducts` (lines 225-228) runs inside the per-plan loop before all blockers are collected; the final blocker gate (line 283) executes only after mutations already happened.

## Current unsafe order

1. Early return if `WW_FLOW_A_MEDIA_CONFIRM !== "1"` (before any load).
2. Load whitelist + media, validate whitelist size/excluded.
3. `buildHandlePlans` (throws on missing rows/files).
4. `listProducts` (read-only).
5. **Loop over plans:**
   - collect per-product blockers (`missing_product` continues; `not_draft`/`launch_mode`/`cart_group`/`collection` push blocker but DO NOT continue);
   - if images already match → skip;
   - if dry-run → record preview, continue;
   - **else `updateProducts` immediately (MUTATION)** — even if this product has blockers and even though other plans / Oxford check are not yet validated.
6. Oxford spot-check adds blockers AFTER mutations.
7. Build report.
8. If blockers > 0 → throw (too late; writes already done).

## Target safe order

1. Load inputs (whitelist, media).
2. Build whitelist/scope + validate size/excluded.
3. `buildHandlePlans` → validate product/media/file mappings.
4. `listProducts` (read-only).
5. Collect ALL blockers: per-product checks + Oxford spot-check. Build preview/pending list. NO mutation.
6. Compute gate: `mutationAllowed = !hasBlockers && !dryRun && confirmApply`.
7. If blockers → write blocked report, log, throw. No mutation.
8. If dry-run → write dry_run report, return. No mutation.
9. If confirm missing → write requires_confirm report, return. No mutation.
10. Only if `mutationAllowed` → loop pending, `updateProducts`, write applied report.

## Mutation points

- Only one: `productModule.updateProducts(...)` — moved into a dedicated post-gate mutation loop guarded by `mutationAllowed`.

## Blocker sources

- `missing_product`, `not_draft`, `launch_mode`, `cart_group`, `collection` (per plan).
- `oxford_status_changed` (spot-check) — MOVED before the gate so it can block mutation.
- Hard throws in `buildHandlePlans` (missing rows / missing static file) remain pre-mutation validation failures.

## Behavior changes (documented)

- Dry-run no longer requires `WW_FLOW_A_MEDIA_CONFIRM=1` (matches audit Phase 6 command `WW_FLOW_A_MEDIA_DRY_RUN=1 ...`). Dry-run still never mutates.
- Missing-confirm run now performs read-only validation and writes a `requires_confirm` report instead of an immediate no-op return.
- Blocked / requires_confirm get their own report filenames so they never overwrite a real apply result.
- Env names preserved: `WW_FLOW_A_MEDIA_DRY_RUN`, `WW_FLOW_A_MEDIA_CONFIRM`.
- Apply and dry-run report paths preserved (`media-apply-result.json`, `media-apply-dry-run-result.json`).
