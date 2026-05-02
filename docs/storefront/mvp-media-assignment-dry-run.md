# MVP Media Assignment Dry-run

## Short Verdict

Dry-run is prepared: **one** SKU is **eligible_for_future_apply** (confirmed white-background). **Four** Oxford-4 pilot SKUs are **eligible_but_paused_scope** (confirmed interim static, not public MVP apply without governance). All other MVP-map rows are **skipped** per eligibility gates.

## Scope

- Input: `data/normalized/storefront-mvp-best-available-media-map.json`
- Output: `data/normalized/storefront-mvp-media-assignment-dry-run.json` (this pass)
- No database writes, no product mutations, no storefront/runtime changes, no `catalog-scope.ts` edits, no publish/stage promotion, no AI images.

## Eligibility Rules (apply-ready strict)

1. `mvp_usage_status` in `use_as_primary` | `use_as_temporary_primary`
2. `identity_confidence` = `confirmed` for **eligible_for_future_apply**
3. `selected_primary_image_path_or_ref` is a concrete path/URL or explicit static reference (not a query-only string like “front-manifest rows where…”)
4. No apply that implies paused collection **publish** or **catalog-scope** workaround
5. Excluded without human sign-off: **probable** / **ambiguous** / **none**, blocked rows, Willie Winkie, Monchelsea probable, Oliver Kids without SKU evidence, non-pilot Oxford

Rule on **Monchelsea `mnm-55-1`**: path in MVP map is a *descriptor* of front-manifest rows, not a single resolved URL — excluded from apply-ready until a concrete `selected_primary_image_path_or_ref` is signed off.

## Dry-run Assignment Table

| ID | SKU / handle | Collection | Type | Verdict | Proposed |
|----|----------------|-------------|------|---------|----------|
| DR-001 | CO-02-1 | country-london-paris | white_background | eligible_for_future_apply | primary_image |
| DR-002 | ox-14-1 / OX-14-1 | oxford | backend_static_existing | eligible_but_paused_scope | temporary_primary_image |
| DR-003 | ox-14-11 / OX-14-11 | oxford | backend_static_existing | eligible_but_paused_scope | temporary_primary_image |
| DR-004 | ox-90-1 / OX-90-1 | oxford | backend_static_existing | eligible_but_paused_scope | temporary_primary_image |
| DR-005 | s-ox-05 / S-OX-05 | oxford | backend_static_existing | eligible_but_paused_scope | temporary_primary_image |

## Skipped Table

| SKU / handle | Collection | Reason | Next action |
|--------------|-------------|--------|-------------|
| mnm-55-1 | monchelsea | probable; no auto-apply | Human sign-off + concrete URL |
| WW-55-1 | willie-winkie | VV semantics / no safe visual | Resolve business gate |
| MNm-57-3 | monchelsea | blocked_no_safe_visual | Source intake |
| MNm-09-1 | monchelsea | blocked_no_safe_visual | Source intake |
| oliver-kids-related | oliver-kids | insufficient SKU evidence | SKU-level manifest |
| non-pilot Oxford | oxford | outside pilot + paused | Governance-only expansion |

## Oxford-4 Note

Confirmed **interim non-white** `backend_static_existing` URLs exist for all four pilot handles. **Oxford remains PAUSED** on storefront; dry-run verdict is **eligible_but_paused_scope** — not general MVP public apply and **not** `white_background_validated`.

## Monchelsea Note

`mnm-55-1` is **probable** and reference path is not a single resolved asset URL in the MVP map — **skipped** until human sign-off and a concrete ref.

## Willie Winkie / ВВ Note

Blocked by painting semantics / no safe identity-locked visual — **skipped**; no dry-run assignment.

## Oliver Kids Note

Aggregate row lacks SKU-level mapping evidence — **skipped** until a dedicated mapping artifact exists.

## Existing Backend Scripts (reference only; not run)

- `apps/backend/src/scripts/refresh-oliver-thumbnails.ts` — Oliver-only approved mapping
- `apps/backend/src/scripts/refresh-oliver-media.ts` — Oliver-only
- `apps/backend/src/scripts/sync-oliver-primary-images.ts` — Oliver-only images vs thumbnail
- `apps/backend/src/scripts/seed-oxford-pilot-four.ts` — Oxford-4 pilot path (isolated from `seed-products.fixed2.json`)

None of these reads `storefront-mvp-best-available-media-map.json`. **No new dry-run wrapper script** is added in this pass; a future script should default to dry-run and require `--apply` explicitly.

## No-runtime / No-DB-change Confirmation

This pass produced documentation and JSON artifacts only. No Medusa DB updates, no product API mutations, no seed/sync, no `catalog-scope.ts` changes.

## Next Apply Gate

1. Human approval for any **probable** or **paused-scope** row intended for real apply.
2. Implement or run a **dedicated** backend job (dry-run default, `--apply` explicit) that reads `storefront-mvp-media-assignment-dry-run.json` or regenerates the same eligibility in code.
3. For **CO-02-1** only: first candidate for a real apply after upload/URL contract check and collection visibility rules are satisfied separately from this artifact.
4. For **Oxford-4**: apply only under explicit pilot/QA governance, never as unpause or public catalog promotion.
