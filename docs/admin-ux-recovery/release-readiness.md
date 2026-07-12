# Release readiness — Woodright Admin UX Recovery

**Date:** 2026-07-12 (MSK)  
**Branch:** `feat/admin-ux-recovery-integration-20260712`  
**Base:** `origin/main`  
**Start HEAD Package F:** `41d1906` (ahead 16 before F commits)

## Scope delivered

Packages A–F + honesty/branding on Medusa **2.17.2** (pinned family: medusa/framework/admin-sdk/cli/types), flag `WOODRIGHT_ADMIN_UX_V1`.

## Environment

| Item | Value |
|------|--------|
| Isolated QA DB | `medusa-admin-ux-b5` |
| Shared runtime | `:9000` / `medusa-store` — not mutated by recovery packages |
| Node validated | 22.22.2 and 20.20.2 (unit suite via tsx on 20) |
| Feature flag rollback | `WOODRIGHT_ADMIN_UX_V1=0` / localStorage `0` hides Woodright content |

## Dependencies / migrations

- Medusa family upgraded **2.13.3 → 2.17.2** (exact pins; Yarn 4 lockfile)
- Isolated QA only: `medusa-admin-ux-b5` migrated; shared `:9000` / `medusa-store` untouched
- Pre-upgrade dump: `tmp/admin-ux-recovery-codex/medusa-admin-ux-b5-pre-2.17.2-*.sql.gz` (local, not committed)
- `patch-skip-cart-promotions.mjs` still applies on 2.17.2 (`#14149` workaround retained)
- No storefront package upgrade in this change

## Rollback

1. Set flag off → Woodright content stubs / widgets hide  
2. Stock Admin remains source of truth for products, prices, media, promotions  
3. Code rollback: restore pre-upgrade `package.json` + `yarn.lock`, `yarn install`, restart `:9001`  
4. DB rollback: restore `medusa-admin-ux-b5` from pre-2.17.2 dump (do not run 2.13.3 against upgraded schema)  

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
