# Orphan Resolution Artifacts

Generated: 2026-06-18T21:44:52.576Z

All JSON exports are advisory and include `do_not_auto_apply: true`. No normalized data or Medusa seed files were written.

## What was produced

- `auto-route-manifest.json`: 4 high-confidence rows with seed-backed handle, operable collection, and no detected cross-SKU blocker.
- `sku-handle-proposals.json`: 329 SKU/handle suggestions with evidence from seed products, legacy media inventory, workbook, legacy products, and filename hints.
- `duplicate-merge-plan.json`: 51 duplicate/camera-burst groups with recommended keeper.
- `defer-dismiss.json`: 1243 clear P3/no-SKU noise rows operators can dismiss or defer.
- `collection-gate-blocked.json`: 312 suggestions held behind collection gates.
- `resolution-summary.json`: counts by action and source.

## Operator next steps

1. Start with `auto-route-manifest.json`; visually confirm each source image, then use Assign in the inbox.
2. Use `duplicate-merge-plan.json` to ignore exact/near filename duplicates that already exist in inventory or to collapse camera-burst groups.
3. Use `sku-handle-proposals.json` for manual assignments. Treat `high` as ready for visual confirmation, `medium` as needs source-page/context check, and `low` as evidence only.
4. Keep `collection-gate-blocked.json` out of Assign until Oxford/Monchelsea/Willie Winkie gates clear.
5. Apply `defer-dismiss.json` only as an inbox triage decision; do not delete source media.

Rerun with:

```sh
node tmp/media-ops-codex-review/orphan-resolution/run-orphan-resolution.cjs
```
