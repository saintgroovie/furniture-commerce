# Release readiness — Woodright Admin UX Recovery

**Date:** 2026-07-12 (MSK)  
**Branch:** `feat/admin-ux-recovery-integration-20260712`  
**Base:** `origin/main`  
**Start HEAD Package F:** `41d1906` (ahead 16 before F commits)

## Scope delivered

Packages A–F on Medusa **2.13.3** / `@medusajs/admin-sdk@2.13.3`, flag `WOODRIGHT_ADMIN_UX_V1`.

## Environment

| Item | Value |
|------|--------|
| Isolated QA DB | `medusa-admin-ux-b5` |
| Shared runtime | `:9000` / `medusa-store` — not mutated by recovery packages |
| Node validated | 22.22.2 and 20.20.2 (unit suite via tsx on 20) |
| Feature flag rollback | `WOODRIGHT_ADMIN_UX_V1=0` / localStorage `0` hides Woodright content |

## Dependencies / migrations

- No Medusa upgrade
- No schema migrations in Admin UX recovery packages
- No storefront changes in F

## Rollback

1. Set flag off → entry content stubs / widgets hide  
2. Stock Admin remains source of truth for products, prices, media, promotions  
3. No data migration required to roll back Workspace UI  

## Known limitations (stock Admin)

- Complex variant construction; rule-based prices; inventory editor  
- Variant-media; physical storage delete  
- Buy X Get Y; free shipping approximation; variant targeting  
- Inline campaign create with promotion (create campaign in stock Admin first)  
- Sidebar may still show custom routes when flag off (SDK limitation) — content gated  

## PR recommendation

Branch will be ahead ~20 commits after F. Prefer **one PR** with commit-range review notes:

1. A foundation  
2. B Product Workspace  
3. C variants/prices  
4. D gallery  
5. E promotions  
6. F dashboard/docs  

Split PRs only if reviewer capacity requires; do not rewrite history.

## Untracked hygiene (never stage)

`.nosync*`, `tmp/`, `apps/backend/static/`, one-off scripts, screenshots, local keys/cookies.
