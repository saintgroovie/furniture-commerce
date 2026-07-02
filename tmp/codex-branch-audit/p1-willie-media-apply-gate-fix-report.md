# P1 Willie media apply gate fix

## Original finding

`apps/backend/src/scripts/apply-willie-winkie-flow-a-product-media.ts:225-228` (P1, Pass 3 backend):
`updateProducts` executed inside the per-plan loop before all blockers were collected. When `WW_FLOW_A_MEDIA_CONFIRM=1` and a later plan (or the Oxford spot-check at the end) produced a blocker, earlier products had already been mutated before the final blocker gate threw.

## Files changed

- `apps/backend/src/scripts/apply-willie-winkie-flow-a-product-media.ts` — handler `applyWillieWinkieFlowAProductMedia` refactored into strict phases.

**Scope note:** this statement refers only to the gate-fix edit. The wider working tree already contains unrelated branch WIP (`git status --short` shows ~526 dirty entries across other tracks); this session did not touch those. In particular `buildHandlePlans` (lines ~84-132, incl. 116-122 buyer-sort thumbnail/gallery ordering) was pre-existing branch WIP and was intentionally left unchanged to honor "fix only this P1 / preserve existing behavior".

## What changed

- Split the single loop into a **validation/collection phase** (no mutation) and a separate **mutation phase** guarded by an explicit gate.
- Moved the Oxford spot-check to run **before** the gate so `oxford_status_changed` blockers can prevent mutation.
- Added an explicit `mutationAllowed` guard.
- Added Phase-4 report fields.
- Dry-run and requires-confirm no longer perform the mutation branch at all.

## New mutation order

1. Load inputs (whitelist, media JSON).
2. Build + validate scope (whitelist size, excluded handles).
3. `buildHandlePlans` → validate media rows + static files (throws on missing).
4. `listProducts` (read-only).
5. Collect ALL blockers (per-product checks + Oxford spot-check) + build pending/skip preview. No mutation.
6. Gate: `mutationAllowed = !hasBlockers && !dryRun && confirmApply`.
7. Mutation phase runs only if `mutationAllowed`.
8. Write report; then `blocked` throws, `dry_run` returns, `requires_confirm` returns.

## Mutation guard

```ts
const hasBlockers = blockers.length > 0
const mutationAllowed = !hasBlockers && !dryRun && confirmApply

let mutationAttempted = false
if (mutationAllowed) {
  for (const item of pending) {
    mutationAttempted = true // flips true only when an actual update is issued
    await productModule.updateProducts(item.productId, { ... })
  }
}
```

The only `updateProducts` call lives inside `if (mutationAllowed)`. There is no mutation anywhere in helper functions or in the validation loop. `mutationAttempted` flips true only immediately before an actual `updateProducts` call, so a confirmed no-op (empty `pending`) correctly reports `mutation_attempted=false` / `gate_verdict=noop`.

## Dry-run behavior

- `WW_FLOW_A_MEDIA_DRY_RUN=1` (with or without confirm) → `mutationAllowed=false`, never mutates.
- Behavior change: dry-run no longer requires `WW_FLOW_A_MEDIA_CONFIRM=1` (matches audit Phase 6 command).

## Confirm behavior

- Missing `WW_FLOW_A_MEDIA_CONFIRM=1` (and not dry-run) → `requires_confirm` report, no mutation (previously an early no-op return before loading).
- Real apply requires `confirmApply === true` AND `hasBlockers === false` AND `dryRun === false`.

## Blocker behavior

- All blockers collected before the gate. If any blocker exists, no product is mutated; report `gate_verdict=blocked`, then throw (non-zero exit preserved).

## Report fields added

`gate_verdict`, `dry_run`, `confirm_present`, `blockers_count`, `mutation_allowed`, `mutation_attempted` (legacy `verdict` preserved).

New report filenames for non-apply gate states (do not overwrite a real apply result):
`media-apply-blocked-result.json`, `media-apply-requires-confirm-result.json`. `media-apply-result.json` (apply) and `media-apply-dry-run-result.json` (dry-run) preserved.

## Validation

- Commands run:
  - `npx tsc --noEmit --pretty false` (backend) — target file: **0 errors**.
  - `WW_FLOW_A_MEDIA_DRY_RUN=1 npx medusa exec ./src/scripts/apply-willie-winkie-flow-a-product-media.ts` — ran read-only.
- Results:
  - Dry-run produced 28 `not_draft:*:published` blockers (whitelisted products currently `published`), gate returned `blocked`, log: `Media apply blocked (28 blocker(s)) — no mutation performed`.
  - Because `mode === "blocked"` takes precedence over `dry_run`, the report is written to `media-apply-blocked-result.json`: `mode=blocked`, `gate_verdict=blocked`, `blockers_count=28`, `mutation_allowed=false`, `mutation_attempted=false` (`dry_run=true`, `confirm_present=false` still recorded).
- Scoped errors (target file): none.
- Pre-existing unrelated errors (not touched): `seed.ts`, `apply-country-assignment-v2-gated.ts`, admin `.tsx` raw-tsc `--jsx` flag errors, `vitest` module resolution in `*.test.ts`.

## Commands explicitly not run

- Real apply (`WW_FLOW_A_MEDIA_CONFIRM=1` without dry-run) — NOT run.
- seed / import / migration — NOT run.
- git add / commit / push — NOT run.

## Residual risks

- The 28 whitelisted products are currently `published`, so a real apply would be fully blocked until they are `draft` again — this is the intended gate, not a regression.
- `buildHandlePlans` still hard-throws on missing preflight files/rows; this now also affects requires-confirm/dry-run runs (validation failure before any mutation, acceptable).
- `:3004` matrix daemon still LISTEN (PID recorded, not stopped per task scope).
