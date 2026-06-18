# Legacy sources registry — Codex re-sort (2026-06-17)

**Verdict:** approve-with-notes → **approve** after implementation

## P1

- Missing `woodright:willie-winkie-business-gate-board:v1` in detect registry → **added** (importOrder 50, deprecated)

## P2

- Flat registry without metadata → **fixed**: `mode`, `sessionSection`, `phase`, `importOrder`, `dualWrite`, `importMode`
- v1/v2 supplement peers → v1 marked `fallback`, importOrder 21 after v2 (20)
- `detectLegacyBoardStorage()` now sorts found items by `importOrder`

## P3

- Overlay immediately after assignment v2 (31 after 30) — **confirmed** in sort order

## Canonical import order

1. orphan review (10)
2. supplement v2 (20)
3. supplement v1 fallback (21)
4. assignment v2 (30)
5. orphan P0 overlay metadata (31)
6. business gate launch deprecated (50)

## Not in registry

- `woodright:media-ops:v1` — target
- migration banner dismiss — sessionStorage
- matrix — API/CSV only
- assignment v1 — URL redirect only
