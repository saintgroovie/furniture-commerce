# Fix log

## 20260918T123500Z

- Saved unique diffs vs `origin/main` to `evidence/patches/` before any apply.
- Created worktree `hygiene-safe-20260918` from `origin/main` (did not switch canonical).
- Parked C2: failsafe regression (`stuck` timeout removed; fallback poll replaced with early `return`).
- Parked C3: helper bypass on catalog card thumb/title.
- Parked C4: slim drops `material_execution_code`; promotion wire uses `projectCatalogBrowseProduct`.
- Applied only `.gitignore` hygiene ignores.
- Canonical and runtime working trees left unchanged.
