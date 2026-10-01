# FIX-NOTES - 20260910T0935Z

Machine JSON (not in git, > small):

- `/Users/leonidmbp/.woodright/worktrees/media-sku-auto-triage-20260910/tmp/media-ops-codex-review/apply-ready-fable-fix/triage-v2.py`
- `.../full-v2board-state.json`
- `.../ship-now-v2board-state.json` (94 SKU)
- `.../gate-report.json` (copy in this run dir)
- `.../hold-for-operator.json` (copy in this run dir)

Self-check P0/P1: all ok. `ol-84-1` keep `_main` + `i2`; drop `gallery_01` and `i1`.

Local apply: LaunchAgent `:9000` / `medusa-store` only. Production: `unsafe_scope`.
CLP not in ship-now.
