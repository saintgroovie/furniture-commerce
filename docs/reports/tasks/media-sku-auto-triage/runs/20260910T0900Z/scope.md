# Scope - media SKU auto-triage

**Trigger:** owner `луп до пуша` after Fable 5.1 review; also asked production ship.
**Type pack:** `media`
**Commit intent:** yes (draft artifact only)
**Production Medusa apply:** out of scope this run (`unsafe_scope`)

## In
- Draft auto-triage export + Fable findings under `docs/reports/tasks/media-sku-auto-triage/`
- ol-84-1 state hygiene (i2 not both kept and rejected)
- per-handle drop ledger
- Honest ship matrix: no apply

## Out
- Medusa apply (local `:9000` or production)
- `data/normalized/**`
- Storefront runtime gallery code
- Unrelated dirty tree (partners pages, iCloud canonical 389-file dirt)
- `git add -A`

## Pathspecs (commit if Codex allows)
```
docs/reports/tasks/media-sku-auto-triage/latest.md
docs/reports/tasks/media-sku-auto-triage/runs/20260910T0900Z/
```
