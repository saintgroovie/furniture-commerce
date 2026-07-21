# Catalog default merchandising order

## What it is

Default buyer catalog order for Woodright: products appear in **collection blocks**, and within each block **anchor furniture** comes before **supporting / complementary** pieces, with **accessories** (mirrors, clocks, decor) last.

This is the order when the storefront sort control is «По умолчанию» (no `sort` query param).

## Runtime warning (false-positive trap)

Canonical local QA on **`:3002` / `:9000`** may run from a **different worktree** that does **not** include this commit. That stack still returns **Зеркало навесное** first.

Buyer-visible proof requires a **candidate pair** built from this branch (e.g. storefront `:3031` → backend `:9031`) with matching git SHA. Check response header:

`x-woodright-catalog-order: merchandising-v1`

on `GET /store/catalog-products` (also via Next rewrite `/store/catalog-products`).

API order alone is not enough - confirm DOM card order after hydration.

## Source of truth

**Backend only:** `apps/backend/src/lib/catalog-merchandising-order.ts`

Applied in `loadStoreProductList(..., { mode: "browse" })` for `GET /store/catalog-products` on the **full** result set (before any future limit/offset).

The storefront must **not** re-implement this table. `sortDisplayEntries` leaves order unchanged when `sort` is unset so client filters preserve relative merchandising order. `groupProductsForDisplay` collapses size variants but keeps **first-seen** group position (relative merchandising order of representatives).

## Why frontend post-pagination sort is forbidden

Reordering only the current page (or only the client page slice) creates wrong global order, duplicates, and gaps across pages. Even though today’s PLP loads the full pool without pagination, merchandising belongs on the browse API so any later pagination stays correct.

## Sort tuple

Ascending:

1. `collection_furniture_class` (furniture-bearing blocks before accessory-only blocks)
2. `collection_rank`
3. `collection_block_key` (contiguous blocks when ranks tie)
4. `item_tier`
5. `item_type_rank`
6. `title` (ru)
7. `handle`
8. `id`

## Collection ranks

Edit `COLLECTION_MERCHANDISING_RANK` in the policy module.

| Collection | Rank |
|------------|------|
| greenwich | 10 |
| oliver / oliver-adult | 20 |
| monchelsea | 30 |
| willie-winkie | 40 |
| oliver-kids | 50 |
| paused… | 80+ |
| unassigned | 90 |
| unknown slug | 95 |

## Item tiers

| Tier | Value |
|------|-------|
| Anchor | 10 |
| Supporting | 20 |
| Complementary | 30 |
| Accessory | 80 |
| Unknown | 90 |

Resolution: `category_handle` → fail-closed furniture-with-mirror override → title fallback → unknown.

## Explicit user sorts

Default / invalid → merchandising. `price_asc` / `price_desc` → client price sort.

## Filters / search / Kids

Filters preserve relative order. Kids uses same browse API + `resolveKidsProducts` (membership-first assembly).

## Pagination

No PLP page slice today. Sort before any future limit/offset.

## How to change order

Edit central policy module; update fidelity tests:

```sh
yarn --cwd apps/backend exec tsx src/lib/catalog-merchandising-order.fidelity.test.ts
yarn --cwd apps/storefront exec tsx src/lib/catalog-merchandising-pipeline.fidelity.test.ts
```
