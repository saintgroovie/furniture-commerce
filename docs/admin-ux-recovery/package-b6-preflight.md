# Package B.6 — preflight

**Date:** 2026-07-12 (MSK)

| Field | Value |
|-------|-------|
| Worktree | `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration` |
| Branch | `feat/admin-ux-recovery-integration-20260712` |
| HEAD | `ba4791d` |
| Upstream | `origin/main` |
| Ahead/behind | ahead 5 / behind 0 |
| Staged | none |
| Tracked dirty | none |
| Untracked | `.nosync*`, `tmp/`, local one-off scripts (`ensure-local-admin`, `repair-b5-classifications`) |
| Node (current shell) | `v22.22.2` — **final gate requires Node 20.x** |
| Yarn | `4.6.0` |
| Package manager | Yarn (Berry) |
| Arch | `x86_64` (darwin) |
| Shell | `/bin/zsh` |

## Nonsensitive env (backend `.env`)

| Key | Status |
|-----|--------|
| `PORT` | `9001` |
| `ADMIN_VITE_PORT` | unset |
| `ADMIN_VITE_HMR` | unset |
| `WOODRIGHT_ADMIN_UX_V1` | `1` |
| `MEDUSA_BACKEND_URL` / CORS / storefront origin | set (values not printed) |
| `DATABASE_URL` | host `localhost`, db `medusa-admin-ux-b5` |
| Secrets (JWT/COOKIE/DB password) | set — values not printed |

## Package inventory (installed)

| Package | Version |
|---------|---------|
| `@medusajs/medusa` | 2.13.3 |
| `@medusajs/admin-sdk` | **missing** (local shim) |
| `react` / `react-dom` | 18.3.1 |
| `vite` | 5.4.21 |

## Suspects entering B.6

1. Custom Admin Vite HMR-disable (`hmr: false`) — Fable R1 candidate for Fast Refresh / blank Admin.
2. Missing `@medusajs/admin-sdk@2.13.3` + local shim.
3. Product Workspace extension modules loaded at startup.
