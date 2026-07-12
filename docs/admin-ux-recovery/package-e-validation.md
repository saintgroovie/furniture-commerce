# Package E — validation

**Date:** 2026-07-12 (MSK)  
**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration`  
**DB:** `medusa-admin-ux-b5` (isolated; shared `:9000` / `medusa-store` untouched)  
**Node:** 22.22.2 (`Node 20 validation pending before merge`)

## Unit tests

```sh
cd apps/backend
node --experimental-strip-types --test \
  'src/admin/lib/promotions/**/*.test.ts' \
  'src/admin/lib/errors/normalize-admin-error.test.ts' \
  'src/admin/lib/feature-flags/*.test.ts' \
  'src/admin/lib/product-workspace/*.test.ts'
```

**Result:** 169/169 pass (Package E + A/B/C/D regression).

## Live cart evidence (Store API, `:9001`)

See `package-e-data-audit.md`.

| Case | Result |
|------|--------|
| Chair + `WR-QA-E-PCT10` | 12500 → 11250 (−1250), attributed |
| Table + `WR-QA-E-AUTO8` | applied via explicit promotions endpoint |
| Table + `WR-QA-E-PCT10` | AUTO8 also computed — do not credit PCT10 |
| Invalid code | 400 |
| Base prices | unchanged |

## Browser QA (Playwright, 1440 / 1280 / 1024)

Artifact: `tmp/admin-ux-package-e/package-e-browser-qa.json` (not committed).

| Check | Result |
|-------|--------|
| List `/app/woodright/promotions` | OK (human copy: скидки не меняют базовые цены) |
| Wizard `/app/woodright/promotions/new` | OK |
| Product tab «Продвижение» | OK |
| Flag off | OK |
| pageErrors | 0 |
| consoleErrors | 0 |
| failed 5xx | 0 |

## Codex

Artifact: `tmp/admin-ux-recovery-codex/package-e-promotions-review.txt`  
Final gate after fail-closed inline campaign + exclusion matching + honest cart copy: see chat / artifact.

## Fail-closed decisions

- Inline nested campaign create: **stock Admin first**, then select existing
- Buyget / free shipping / variant targeting: stock Admin / fail-closed
- Product tab include∩exclude → `needs_cart_check`

## Residual

- Node 20 pending before merge
- Shared `:9000` may hold Vite WS `:24678` (non-fatal for develop with `ADMIN_VITE_HMR=0`)
- `medusa build` backend seed TS warnings remain pre-existing; frontend build OK
- Fixture scripts / publishable key / cookies stay in `tmp/` only
