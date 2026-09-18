# Fix log

1. Dumps and LE already done in prior turns (SQL 2026-09-18, tar 2026-09-12, `woodright.ru_le2`).
2. Small configs extracted from existing tar; junk extracts deleted.
3. Pointer commits existed only on diverged Timeweb branch. Cherry-picked onto `origin/main` worktree.
4. Loop artifacts added under `docs/reports/tasks/legacy-cscart-isp/`.
5. Push + PR target this isolated branch only.
