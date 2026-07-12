# Package E — Data audit (isolated DB `medusa-admin-ux-b5`)

**Date:** 2026-07-12 (MSK)  
**Admin:** `http://localhost:9001`  
**Mutations:** isolated DB only (shared `:9000` / `medusa-store` untouched)

## Baseline (before fixtures)

| Metric | Count |
|--------|------:|
| Promotions | 0 |
| Campaigns | 0 |
| Collections | 0 |

## Infrastructure prepared for cart QA

| Item | ID / note |
|------|-----------|
| QA collection | `pcol_01KXB3KP299JBVDWWHYTQSHTQ0` (`wr-qa-e-collection`) with chair + table |
| Stock location | `sloc_01KXB3NV06ZV2X5177WTZT1PM0` linked to default sales channel |
| Inventory levels | 100 units for chair + table inventory items |
| Sales channel products | chair + table added to default SC |
| Region | `reg_01KX9PC4TW52T6DHRMZ54F34GB` (RUB) |
| Publishable key | Default publishable key present (token used only in local tmp) |

## Fixture promotions (prefix `WR-QA-E-*`)

| Label | Code | Status | Notes |
|-------|------|--------|-------|
| pct-product-10 | `WR-QA-E-PCT10` | active | 10% items → chair product |
| pct-collection-15 | `WR-QA-E-COL15` | active | 15% collection |
| fixed-rub-3000 | `WR-QA-E-FIX3K` | active | fixed 3000 RUB items; currency rule |
| code-order-5 | `WR-QA-E-CODE5` | active | 5% order |
| auto-pct-8 | `WR-QA-E-AUTO8` | active | automatic 8% on table product |
| scheduled | `WR-QA-E-SCHED` | active | future campaign |
| expired | `WR-QA-E-EXPIRED` | active | past campaign |
| draft | `WR-QA-E-DRAFT` | draft | |
| inactive | `WR-QA-E-OFF` | inactive | |
| exclusion | `WR-QA-E-EXCL` | active | in[P1,P2] + ne[P2] |
| usage-budget | `WR-QA-E-USAGE` | active | usage budget campaign |
| spend-budget | `WR-QA-E-SPEND` | active | spend budget campaign |
| overlap-a/b | `WR-QA-E-OVLP-A/B` | active | both target chair |
| Buy X Get Y | — | **not created** | stock Admin fallback |
| Free shipping | — | **not created** | stock Admin fallback |

## Campaigns

| Identifier | Budget | Window |
|------------|--------|--------|
| `wr-qa-e-usage` | usage 100 | active now |
| `wr-qa-e-spend` | spend 500000 rub | active now |
| `wr-qa-e-scheduled` | usage 50 | future |
| `wr-qa-e-expired` | usage 50 | past |

## Live cart verification (Store API)

| Case | Result |
|------|--------|
| Chair + `WR-QA-E-PCT10` | applied: 12500 → 11250 (−1250); adjustment attributed to code |
| Table + `WR-QA-E-PCT10` | PCT10 not on table; **automatic** `WR-QA-E-AUTO8` still computed on `POST .../promotions` (−3672) — attribution must not credit PCT10 |
| Table + `WR-QA-E-AUTO8` explicit | applied (automatic via required code on promotions endpoint) |
| Invalid code | 400 `The promotion code … is invalid` |
| Base variant prices before/after | **unchanged** (`amount: 12500 rub`) |

### Patch note (#14149)

`create-carts` / `refresh-cart-items` still skip auto promotion refresh. Explicit `POST /store/carts/:id/promotions` **does** run computeActions (including automatics) in this smoke — no SQL failure observed with the WR-QA-E fixture set.

## Unknown / residual

- Variant-level targeting still unsupported in official rule map (fixed “on variants” fixture uses **product** targets).
- Exhausted budget not forced in fixtures (would require consuming usage/spend).
