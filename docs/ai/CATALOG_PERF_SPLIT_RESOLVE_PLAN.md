# Catalog perf - resolve split onto main

**Date:** 2026-07-12  
**Goal:** land catalog-perf commits on a clean PR from `main`, separate from Willie #15.

## Order

1. Worktree from `origin/main` → branch `feat/catalog-perf-load`
2. Cherry-pick `3defdf9` and resolve conflicts (prefer catalog-perf intent; keep `main` APIs where unrelated)
3. Cherry-pick `866f537` → `785c08b` → `c8eaccc` → `f560329` (resolve if needed)
4. Cherry-pick or re-apply `2898840` docs (runbook / next-actions / env warning) if missing
5. Push + `gh pr create` → `main`
6. Comment on #15 with new PR URL

## Conflict files (known from `3defdf9`)

- `apps/backend/src/api/store/products/route.ts` - thin wrapper → `loadStoreProductList`
- `apps/backend/src/api/store/room-sets/[slug]/route.ts` - lean opt-in fields
- `apps/storefront/src/app/catalog/page.tsx` - browse client / catalog-products
- `apps/storefront/src/app/kids/catalog/page.tsx` - kids + browse path
- `apps/storefront/src/lib/kids.ts` - keep fail-closed; take perf-side membership helpers if needed

## Stop if

- Kids fail-closed / BESPOKE rules would weaken
- Unrelated Willie-only behavior must be invented on `main`
- Conflict needs product judgment beyond catalog-perf

## Do not

- Force-push #15
- `git add -A`
- Bake prod H4 flag
