# Package C preflight

**Date:** 2026-07-12 (MSK)
**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration`
**Branch:** `feat/admin-ux-recovery-integration-20260712`
**HEAD:** `4120b0a`
**Upstream:** `origin/main` (ahead 8, behind 0)

## Tree state

| Item | Value |
|------|-------|
| Staged | empty |
| Tracked dirty | empty |
| Untracked (excluded from commits) | `.nosync*`, `tmp/`, `ensure-local-admin.ts`, `repair-b5-classifications.ts` |
| Node | v22.22.2 (Node 20 pending before merge) |
| Yarn | 4.6.0 |
| Medusa | 2.13.3 |
| `@medusajs/admin-sdk` | 2.13.3 exact |
| Isolated DB | `medusa-admin-ux-b5` @ localhost:5432 |
| Shared `:9000` | listening (not used for Package C writes) |
| QA port | `:9001` |

## Safety checks

- Package B remains on branch (commits through `4120b0a`).
- Shared DB / shared runtime not targeted for writes.
- Source/recovery worktrees not modified for Package C.
- One-off scripts and `tmp/` will not be staged.
