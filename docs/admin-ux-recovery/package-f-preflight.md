# Package F — Preflight

**Date:** 2026-07-12 (MSK)

**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration`  
**Branch:** `feat/admin-ux-recovery-integration-20260712`  
**HEAD (start):** `41d1906`  
**Upstream:** `origin/main`  
**Ahead/behind:** ahead 16 / behind 0

## Git

| Item | Status |
|------|--------|
| Staged | empty |
| Tracked dirty | none |
| Diff vs `origin/main` | 131 files, +16624 / −69 |
| Untracked (exclude from commits) | `.nosync*`, `tmp/`, `apps/backend/static/`, `ensure-local-admin.ts`, `repair-b5-classifications.ts` |

## Package A–E commit map (newest first)

| Package | Commits (representative) |
|---------|--------------------------|
| E | `41d1906` … `5c881ef` |
| D | `4987dd8`, `7ac44e8` |
| C | `be81f7a`, `da7cb9f` |
| B / B.6 | `4120b0a` … `25e6791` |
| A | `73a3b9c` |

## Runtime

| Item | Value |
|------|--------|
| Isolated DB | `medusa-admin-ux-b5` |
| Intended admin port | `:9001` (may be down — start locally) |
| Shared `:9000` | may listen on `medusa-store` — **no Package F mutations** |
| Medusa / admin-sdk | `2.13.3` |
| Node | `22.22.2` (Node 20 gate required before merge) |
| Yarn | `4.6.0` |
| Feature flag | `WOODRIGHT_ADMIN_UX_V1` |

## Safety

- Do not stage `tmp/`, `.nosync*`, upload leftovers, one-off scripts, secrets
- Canonical / mirror worktrees not used for Package F commits
- No push / PR / merge in this package
