# Package D — Preflight

**Date:** 2026-07-12 (MSK)

**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration`
**Branch:** `feat/admin-ux-recovery-integration-20260712`
**HEAD:** `be81f7a`
**Upstream:** `origin/main`
**Ahead/behind:** ahead 10 / behind 0

## Git

| Item | Status |
|------|--------|
| Staged | empty |
| Tracked dirty | none |
| Untracked (excluded from commits) | `.nosync*`, `tmp/`, `ensure-local-admin.ts`, `repair-b5-classifications.ts` |

## Runtime

| Item | Value |
|------|--------|
| Isolated DB | `medusa-admin-ux-b5` only |
| Intended admin port | `:9001` |
| Shared `:9000` | may be up — **no Package D mutations** |
| Medusa | `2.13.3` |
| `@medusajs/admin-sdk` | `2.13.3` exact |
| Node | `22.22.2` |
| Yarn | `4.6.0` |
| Feature flag | `WOODRIGHT_ADMIN_UX_V1=1` in `.env`; browser also needs `localStorage` |

## Safety checks

- Shared DB/runtime not used for test writes
- Package A/B/C commits present on branch
- Canonical / mirror worktrees not used for Package D commits
- Node 20 validation remains residual before merge
