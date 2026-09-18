# Fix log - 20260910T0935Z

1. Fable 5.1 background rewrite had not landed artifacts (no `apply-ready-fable-fix/` yet). Loop T4 implemented `triage-v2.py` from Fable P0/P1.
2. Prefer `_main` as hero; `-i2` as live second angle; treat `-i1` as copy-of-main when `_main` exists.
3. Collapse JSON: keep `keep_basename`, reject `drop_basenames`. Drop processed/legacy copies, PDF/scheme, catalog pages (`Country_p*`, `Provence_White_page*`).
4. Do not surplus-drop distinct `gallery_01` when it is not a collapse drop (Provence paint×wood / white live).
5. Ship-now = 94 SKU (Oliver + Oliver Kids + Provence). Hold: 13 CLP + `ol-05-н`.
6. Self-check P0/P1 handles all `ok` including `ol-84-1` = `_main` + `i2`.
7. Codex `request-changes`: add fail-closed localhost:9000 + medusa-store guards; photo-only (no metadata write); scope.md names `apply-ship-now-v2board.ts`; dry-run before mutate.
