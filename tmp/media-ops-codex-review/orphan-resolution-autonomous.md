# Autonomous Orphan Resolution

- Generated: 2026-06-18T21:44:52.576Z
- Verdict: approve operator-only suggestions; no normalized auto-apply.
- Queue rows: 2548
- Auto-route manifest rows: 4
- SKU/handle proposals: 329
- Duplicate merge groups: 51
- Defer/dismiss rows: 1243
- Collection-gate blocked rows: 312

## P1

- Use `orphan-resolution/auto-route-manifest.json` first. These are seed-backed, operable collection rows with no cross-SKU risk.
- Keep `orphan-resolution/collection-gate-blocked.json` blocked until collection-specific gates are approved.

## P2

- Work `orphan-resolution/sku-handle-proposals.json` by confidence. Medium/low rows need source-page or visual confirmation before Assign.
- Use `orphan-resolution/duplicate-merge-plan.json` to collapse known duplicate basenames and camera-burst groups.

## P3

- `orphan-resolution/defer-dismiss.json` contains low-value no-SKU noise suitable for defer/dismiss triage.

## Applied vs Operator-only

- Applied: rerunnable artifact generation and a narrow bootstrap seed JSON shape fix.
- Operator-only: all assignment, merge, defer, and dismiss decisions. Every export keeps `do_not_auto_apply`.
