# MVP Best-available Media Fill

## Short Verdict

Controlled MVP media triage is prepared: card visuals can be filled with best-available safe candidates where identity is clear, while blocked/ambiguous rows remain explicitly separated and moved to follow-up backlog.

## MVP Media Strategy

- White-background image remains first priority whenever identity is confirmed.
- If white-background is missing, use best available non-white visual only when product identity remains clear.
- Legacy/front visual is allowed as temporary fallback source, never as silent final truth.
- If identity is unclear, row is blocked and routed to manual/AI follow-up backlog.
- This pass is mapping/planning only; no runtime assignment or publish action.

## Source Priority

1. `white_background_confirmed`
2. `backend_static_existing`
3. `legacy_reference_fallback`
4. `catalog_or_pdf` with clear identity
5. `room_context` with clear identity
6. ambiguous/generic -> blocked

## What Counts As Acceptable Temporary Photo

- Product is visually recognizable and mapped to SKU/handle with at least probable confidence.
- Candidate is explicitly marked temporary and non-white fallback when applicable.
- Candidate does not imply collection readiness or rollout unlock.

## What Must Not Be Used

- Ambiguous/generic visuals without clear product identity.
- Candidate that can map to multiple products.
- Any fallback that masks paused/excluded governance blockers.
- Any claim that a non-white interim image is white-background validated.

## Collection Summary

- `oxford`:
  - pilot subset has confirmed interim backend static images (`OX-14-11`, `OX-90-1`, `OX-14-1`, `S-OX-05`),
  - white-background not confirmed for these rows,
  - usable only as temporary interim candidates under paused governance.
- `monchelsea`:
  - partial usable base exists; one probable fallback (`MNm-55-1`) can be temporary with reviewer sign-off,
  - multiple rows remain blocked due missing deterministic source.
- `willie-winkie`:
  - no safe identity-locked fallback selected in this pass,
  - remains blocked by semantics/source gate.
- `oliver-kids`:
  - treated as selective backfill track; current evidence insufficient for safe SKU-level auto-selection.
- `greenwich`, `oliver`:
  - kept as reference baselines, not rollout targets for this pass.

## Summary By Source Type (selected primary)

- `white_background`: 1
- `backend_static_existing`: 4
- `legacy_front`: 1
- `catalog_or_pdf`: 0
- `room_context`: 0

## Blocked / No-safe-visual

- `WW-55-1 / ww-55-1` (Willie Winkie): no safe identity-locked visual.
- `MNm-57-3 / mnm-57-3` (Monchelsea): no front/disk match for join key.
- `MNm-09-1 / mnm-09-1` (Monchelsea): deterministic candidate missing.
- `non-pilot-oxford-skus` (Oxford): paused + outside pilot-validated media scope.
- `oliver-kids-related-products`: insufficient dedicated SKU evidence packet.

## Later AI-generation Backlog

Moved to backlog only (no generation now):

- `WW-55-1 / ww-55-1`
- `MNm-57-3 / mnm-57-3`
- `MNm-09-1 / mnm-09-1`
- `oliver-kids-related-products`

## Next Implementation Step

Use `data/normalized/storefront-mvp-best-available-media-map.json` as dry-run input for controlled, reviewer-gated temporary mapping pass:

1. Approve/reject probable rows (`MNm-55-1`) with human sign-off.
2. Apply only `use_as_primary` and approved `use_as_temporary_primary` rows through backend media pipeline (not frontend hacks).
3. Keep paused/excluded collections unpublished and preserve no-op behavior when evidence is missing.
