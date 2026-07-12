# Medusa upgrade 2.13.3 → 2.17.2 — validation

**Date:** 2026-07-13 (MSK)  
**Branch:** `feat/admin-ux-recovery-integration-20260712`  
**Codex plan:** approve-with-notes (exact 2.17.2; Yarn 4; b5 snapshot; reject mixed family)

## Done

| Step | Result |
|------|--------|
| b5 `pg_dump` snapshot | `tmp/admin-ux-recovery-codex/medusa-admin-ux-b5-pre-2.17.2-*.sql.gz` (local) |
| Stop `:9001` only | Shared `:9000` stayed healthy |
| Pin packages | `medusa`/`framework`/`admin-sdk`/`cli`/`types` = `2.17.2` |
| `yarn install` | Family resolves to 2.17.2; `#14149` patch still applies |
| `yarn build` | Backend + Admin frontend success (JSX fragment fix; seed TS casts) |
| `yarn db:migrate` on b5 | Migrations + scripts completed |
| Unit tests | `206/206` pass (`src/admin/lib/**/*.test.ts`) |
| Browser smoke `:9001` | Login Woodright, dashboard, product workspace, promotions; `:9000` healthy |

## Out of scope (unchanged)

- Classification migration P0  
- Shared `medusa-store` / `:9000` upgrade  
- Storefront Medusa client bump  
- Removing cart-promotion patch without cart regression evidence  
