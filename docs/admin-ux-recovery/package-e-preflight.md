# Package E — Preflight

**Date:** 2026-07-12 (MSK)

**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration`  
**Branch:** `feat/admin-ux-recovery-integration-20260712`  
**HEAD (start):** `4987dd8`  
**Upstream:** `origin/main`  
**Ahead/behind:** ahead 12 / behind 0

## Git

| Item | Status |
|------|--------|
| Staged | empty |
| Tracked dirty | none |
| Untracked (excluded from commits) | `.nosync*`, `tmp/`, `apps/backend/static/`, `ensure-local-admin.ts`, `repair-b5-classifications.ts` |

## Runtime

| Item | Value |
|------|--------|
| Isolated DB | `medusa-admin-ux-b5` only |
| Shared `:9000` DB | `medusa-store` — **no Package E mutations** |
| Intended admin port | `:9001` |
| Store / storefront | Store API on `:9001`; storefront may be on `:3002` (read-only for E) |
| Medusa | `2.13.3` (installed) |
| `@medusajs/admin-sdk` | `2.13.3` exact |
| Node | `22.22.2` |
| Yarn | `4.6.0` |
| Feature flag | `WOODRIGHT_ADMIN_UX_V1=1` in `.env`; browser also needs `localStorage` / `window.__WOODRIGHT_ADMIN_UX_V1__` |
| `COOKIE_SECURE` | `0` for local HTTP `medusa start` / develop |
| `ADMIN_VITE_HMR` | `0` default (HMR off) |

## Safety checks

- Shared DB/runtime not used for promotion/cart test writes
- Packages A/B/C/D present on branch; unit smoke (flags + error normalizer) green
- Canonical / mirror worktrees not used for Package E commits
- Node 20 validation remains residual before merge
- Cart promotions postinstall patch (`patch-skip-cart-promotions.mjs`, Medusa #14149) is active — cart verification must use explicit Store promotion endpoints and document automatic-apply limits

## Commit exclusions

Do not stage: `tmp/`, `.nosync*`, `apps/backend/static/`, one-off scripts, secrets, shared DB config.
