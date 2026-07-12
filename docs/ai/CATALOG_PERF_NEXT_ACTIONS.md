# Catalog perf - next actions (execute order)

**Date:** 2026-07-12  
**Repo:** `/Users/leonidmbp/Documents/projects/furniture-commerce`  
**Codex after W3g:** DEFER W3e/W3f/W3h until Prod H4 + PR hygiene + new bottleneck evidence

## Order (do in sequence)

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Commit H4 runbook + plan pointer + `.env.example` warning | Agent | DONE |
| 2 | Split catalog-perf onto `main` | Agent | DONE - `feat/catalog-perf-load` |
| 3 | Open PR #24 + comment on #15 | Agent | DONE |
| 3b | Codex merge gate on #24 + P1 fixes | Agent | DONE - `safe_to_merge` (`d26e346`) |
| 4 | Merge PR #24 | Operator | WAIT (approve merge) |
| 5 | Prod H4 on production Medusa | Operator | WAIT (needs prod host) |
| 6 | W3e / W3f / W3h | - | DEFER |

## Split result

PR: https://github.com/saintgroovie/furniture-commerce/pull/24  

Post-split fixes for Codex:
- default `/store/products` full projection; lean = browse only
- RoomSet default detail = main contract; lean only `view=product_ids`
- BESPOKE checked before kids cart stamps
- postinstall: only existing `patch-skip-cart-promotions.mjs`

## Prod H4 (local green, prod pending)

- Local `h4-coverage-gate --http`: 157/157 OK  
- Runbook: `docs/operator/catalog-card-derivatives-release.md`  
- Do **not** bake `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1` in prod until generate → deploy → prod HTTP gate

## Do not

- Force-push / rewrite #15 history casually  
- Bake prod H4 flag without step 5  
- Start W3e/W3f/W3h without new evidence  
- `git add -A`
