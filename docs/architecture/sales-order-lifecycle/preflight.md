# Preflight — sales modes + order lifecycle

**Timestamp:** 2026-07-25T01:33:16+03:00 (MSK)
**Canonical:** `/Users/leonidmbp/Documents/projects/furniture-commerce` (resolves under iCloud archive path)
**Thin mirror:** `/Users/leonidmbp/furniture-commerce` — not used for edits
**Clean worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725`
**Branch:** `feat/sales-modes-order-lifecycle-20260725`
**Base SHA:** `081da6e8170b70370385a01df4cb44966284b7a0` (= current `origin/main`)
**Prompt-claimed baseline:** `eb298fd88e8877b3b35dc1e38536acab05bbf81f` (present in history; **not** current `origin/main`)
**Worktree dirty files:** 0
**Primary dirty worktree:** not touched

## Medusa

- Declared + lockfile-resolved: **2.17.2** (`@medusajs/medusa`, `@medusajs/framework`, `@medusajs/admin-sdk`)
- No Medusa version bump in this cycle

## Open PRs (sample)

See `open-prs.json`. Unrelated open PRs exist (#86, #55, #53, #36, #35, #33, #23, #21…). This feature uses a new branch from `origin/main`.

## Hard constraints confirmed

- No public deploy / no `woodright.ru` / no live backfill
- Primary dirty tree untouched
- Custom modules exist; **zero** checked-in MikroORM migration folders (pattern: `medusa db:generate` + `db:migrate`)
