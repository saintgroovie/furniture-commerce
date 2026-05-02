# MVP Media Fill Implementation Plan (Controlled, Not Executed)

## Plan Intent

Provide a safe execution plan for applying selected best-available primary images from `data/normalized/storefront-mvp-best-available-media-map.json` in a future pass, without changing architecture or bypassing rollout governance.

## Existing Pipeline To Reuse

- Keep Medusa backend as source of truth for product media.
- Reuse existing project media evidence lane and normalized artifacts referenced in `docs/project/CODEMAP.md`.
- For Oxford pilot subset, reuse already validated static evidence references only as controlled interim inputs.

No new runtime logic is required for this planning pass.

## Safe Mapping Strategy

1. Input selection:
   - include only rows where `mvp_usage_status` is:
     - `use_as_primary`, or
     - `use_as_temporary_primary` with reviewer approval.
2. Exclude rows where:
   - `mvp_usage_status = blocked_no_safe_visual`,
   - identity is `ambiguous` or `none`,
   - collection governance forbids publish implication.
3. Preserve explicit provenance:
   - keep source type and confidence metadata in assignment notes/log.
4. Preserve temporary labeling:
   - non-white fallback rows remain temporary and replacement-tracked.

## How To Keep Backend As SoT

- Perform assignment through backend data/media workflow layer (not frontend conditionals).
- Do not add frontend fallback logic that overrides backend media records.
- Do not mutate workbook/commercial source files.

## Paused/Excluded Collection Guardrails

- Oxford remains paused for full rollout.
- Monchelsea and Willie Winkie remain excluded.
- Oliver Kids remains selective backfill track.
- Candidate assignment planning is allowed; publish/unpause is not.

## Dry-run Specification

Future dry-run should:

1. Read `storefront-mvp-best-available-media-map.json`.
2. Emit:
   - `would_assign` list,
   - `would_skip` list (with reason),
   - `blocked` list (unchanged from mapping),
   - `temporary_fallbacks` list requiring later replacement.
3. Verify no target row touches paused/unapproved publish scope.
4. End with no-op database behavior in dry-run mode.

## Rollback / No-op Behavior

- If mapping confidence gates fail, do not apply any change.
- If source reference is unavailable at apply time, skip row and keep existing media.
- If partial apply fails, rollback to pre-run media state snapshot.
- If pipeline cannot ensure deterministic mapping, abort and return review report only.

## If No Existing Apply Script Fits

- Add a separate future script in a dedicated pass (after explicit approval).
- Script should support:
  - strict input schema validation,
  - dry-run by default,
  - explicit `--apply` flag,
  - immutable audit log output.

No apply script is created in this pass.
