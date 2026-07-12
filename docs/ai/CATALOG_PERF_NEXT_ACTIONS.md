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
| 3b | Codex merge gate on #24 + P1 fixes | Agent | DONE - `safe_to_merge` (`d26e346`, reconfirmed `768cd7d`) |
| 4 | Merge PR #24 | Agent | DONE - `6192f49` on `main` |
| 5 | Prod H4 on production Medusa | Operator | WAIT (needs prod host) |
| 6 | W3e / W3f / W3h | - | DEFER |

## Split result

PR: https://github.com/saintgroovie/furniture-commerce/pull/24 (**MERGED**)

Invariants kept through main sync + merge:
- default `/store/products` full projection; lean = browse / `catalog-products` only
- RoomSet default detail = main contract; lean only `view=product_ids`
- BESPOKE checked before kids cart stamps
- `postinstall`: skip-cart-promotions + medusa-develop-watch `--warn-only`
- `generate:catalog-card-derivatives` + `sharp` retained

## Prod H4 (local green, prod pending)

- Local `h4-coverage-gate --http` (canonical static / Medusa `:9000`): **157/157 OK**
- Runbook: `docs/operator/catalog-card-derivatives-release.md`
- Do **not** bake `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1` in prod until generate → deploy → prod HTTP gate
- Agent resume file (one line, host only, no secrets): `tmp/catalog-perf/PROD_MEDUSA_URL`

## Do not

- Force-push / rewrite #15 history casually
- Bake prod H4 flag without step 5
- Start W3e/W3f/W3h without new evidence
- `git add -A`
