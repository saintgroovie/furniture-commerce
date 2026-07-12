# Catalog perf - next actions (execute order)

**Date:** 2026-07-12  
**Repo:** `/Users/leonidmbp/Documents/projects/furniture-commerce`  
**Codex after W3g:** DEFER W3e/W3f/W3h until Prod H4 + PR hygiene + new bottleneck evidence

## Order (do in sequence)

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Commit H4 runbook + plan pointer + `.env.example` warning (scoped) | Agent | NOW |
| 2 | Split catalog-perf onto `main` via cherry-pick | Agent | **DONE** - `feat/catalog-perf-load` |
| 3 | Open new PR / comment on #15 | Agent | NOW |
| 4 | Prod H4 on production Medusa | Operator | WAIT (needs prod host) |
| 5 | W3e / W3f / W3h | - | DEFER |

## Split result (2026-07-12)

Branch `feat/catalog-perf-load` from `origin/main` with resolved cherry-picks.
Also brought `copy-lines.tsx` + `format-ru-copy.ts` (needed by catalog pages; not on main).
`package.json`: kept main scripts; added `generate:catalog-card-derivatives` + `sharp` only.

## Split blocker (resolved)

Was:

Cherry-pick `3defdf9` onto `origin/main` (`4d12dda`) conflicted in:

- `apps/backend/src/api/store/products/route.ts`
- `apps/backend/src/api/store/room-sets/[slug]/route.ts`
- `apps/storefront/src/app/catalog/page.tsx`
- `apps/storefront/src/app/kids/catalog/page.tsx`
- `apps/storefront/src/lib/kids.ts` (large)

Worktree aborted; no force-push. Backup ref: `refs/backup/pre-catalog-perf-split-*`.

**Next for split:** resolve conflicts in a dedicated session (or rebase/replay onto updated `main` after Willie lands), then resume cherry-pick of `866f537`…`f560329` + runbook.

## Split commit set (slice A)

1. `3defdf9` lean API / client filters / media gates  
2. `866f537` slim browse DTO + card image contract  
3. `785c08b` Sharp generate + env-gate heroes  
4. `c8eaccc` wave-3 browse fields + coverage/baseline scripts  
5. `f560329` W3g below-fold extras deferral  
6. (+ runbook commit if not already in history)

## Do not

- Force-push or rewrite #15 history in this pass  
- Bake prod `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1` without step 4  
- Start W3e/W3f/W3h without new evidence  
- `git add -A` / touch unrelated dirty tree

## Stop if

- Cherry-pick onto `main` conflicts beyond quick resolve → abort split, report  
- Prod host unknown → leave step 4 blocked with exact commands from `docs/operator/catalog-card-derivatives-release.md`
