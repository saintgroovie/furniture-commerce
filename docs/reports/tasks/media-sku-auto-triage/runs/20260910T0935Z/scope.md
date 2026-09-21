# Scope - media SKU auto-triage (loop type=media)

**Trigger:** owner `да` after offer `луп` / `луп до пуша` / `луп: type=media`. Prior turn: Fable fix + Grok ship-now + catalog inject.
**Type pack:** `media`
**Commit intent:** yes (docs + run reports). Catalog inject: yes, local `:9000` only.
**Production Medusa apply:** out of scope (`unsafe_scope`)

## In
- Rewrite triage so second live angle (`-i2`) is kept, not `-i1` copy of `_main`
- Respect `media-near-dup-collapse.json`
- Provence white/live extras not surplus-wiped
- Hero not detail-crop / line-drawing
- Ship-now: Oliver + Oliver Kids + Provence that pass gates
- Local Medusa apply via untracked `runtime-candidate-main/apps/backend/src/scripts/apply-ship-now-v2board.ts` (photo-only thumbnail+images; fail-closed `localhost:9000` + `medusa-store`). Not `apply-legacy-assign-prefill.ts` (that path rewrites Provence paint×wood).

## Out
- Production / remote Medusa
- CLP `co-*` (operator gold 2026-06-23)
- `ol-05-н` (cyrillic handle)
- Storefront runtime gallery code
- Unrelated dirty iCloud canonical tree
- `git add -A`

## Pathspecs (commit if Codex allows)
```
docs/reports/tasks/media-sku-auto-triage/latest.md
docs/reports/tasks/media-sku-auto-triage/runs/20260910T0935Z/
```
Large JSON stays in `tmp/media-ops-codex-review/apply-ready-fable-fix/` (gitignored).
