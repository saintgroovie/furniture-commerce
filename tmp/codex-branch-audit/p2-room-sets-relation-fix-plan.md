# P2 — room-sets item→product relation fix plan

## Original finding (Codex pass3-backend-review.txt)

> [P2] Use the room_set_item product relation — `apps/backend/src/api/store/room-sets/[slug]/route.ts:22`
> For room-set PDPs with items, this switches the query from the existing singular `product.*` relation to `products.*`,
> then reads `item.products?.[0]`. The link and the admin route still expose `product`, so the storefront response will
> lose each item's product/variants/classification data and break room-set add-to-cart/display flows.

Codex assumed the **correct** relation name is `product` (singular) and that `products` (plural) is the bug.

## Runtime evidence (read-only `medusa exec` diagnostic, then deleted)

Probed `query.graph({ entity: "room_set_item", fields: [...] })` against the live dev DB (:9000):

| Relation field | Result |
|---|---|
| `product.id` / `product.title` / `product.*` | **ERROR** — `Entity 'RoomSetItem' does not have property 'product'` |
| `products.*` (+ `products.variants.*`, `products.product_classification.product_type`) | **OK** — 16 `room_set_item` rows resolve |

- `room_set_item count = 16`; `itemsWithProducts = 0`, `totalLinkedProducts = 0` → the product links are simply **not populated** in this dev DB (seed/data state), which is why arrays come back empty. This is a data condition, **not** a code bug.
- The valid relation name is `products` (plural). This matches `defineLink({ linkable: product, isList: true }, roomSetItem)` (list side on product ⇒ `roomSetItem.products`) and the already-committed `admin/woodright/products/[id]/site-readiness/route.ts` which uses `products.id` (its own smoke note: `product.id` → 500, `products.id` → 200).

## Conclusion: finding direction is INVERTED

- `apps/backend/src/api/store/room-sets/[slug]/route.ts` (dirty WIP): uses `products.*` and maps `products?.[0] → product`. **This is CORRECT.** Reverting it to `product` (as the finding literally suggests) would make the buyer-facing room-set PDP query throw. So we do **not** touch the query relation here.
- `apps/backend/src/api/admin/room-sets/[id]/route.ts` (committed HEAD): uses `fields: ["*", "product.*"]` → **the genuinely broken relation**. `product` is not a property of `RoomSetItem`, so this GET fails at query resolution. This is the same P2 relation class the finding points at ("the admin route still expose `product`") — just the opposite file is the broken one.

## File(s) — FINAL decision (after Codex re-review)

- `apps/backend/src/api/store/room-sets/[slug]/route.ts` — **the in-scope target**. Relation already correct (`products.*`); additionally fixed the slug lookup (was load-all + in-memory `.find`) to a slug-scoped query per Codex re-review + task Phase 4.
- `apps/backend/src/api/admin/room-sets/[id]/route.ts` — **NOT changed** (out of scope). Its `product.*` relation bug is real but pre-existing/committed; documented as a separate follow-up. (An earlier attempt to fix it here was reverted after Codex flagged scope.)

## Current behavior

- Store `[slug]` GET: correct — loads `products.*`, returns `item.product` (singular) matching the storefront contract (`room-set-cta.tsx` reads `item.product.product_classification.product_type` / `item.product.variants`).
- Admin `[id]` GET: broken — invalid `product.*` relation.

## Expected behavior

- Admin `[id]` GET loads the valid `products.*` relation and preserves its existing response shape (`item.product` singular), consistent with the store route and site-readiness route.

## Smallest safe fix — FINAL

- In store `[slug]/route.ts`: keep the correct `products.*` relation + `products?.[0] → product` mapping (response shape preserved), and replace the load-all-active + in-memory `.find(rs.slug === slug)` lookup with a slug-scoped query `listRoomSets({ slug, is_active: true }, { take: 1 })` → `list[0]`. This satisfies "load the correct room-set by slug", avoids false 404 under pagination, and avoids full-list reads.
- Do NOT touch the admin `[id]` route in this scoped fix (reverted; documented as follow-up).

## Validation plan

- `npx tsc --noEmit` scoped to backend; classify scoped vs pre-existing errors.
- Backend `/health` 200; storefront `/catalog` + `/kids/catalog` still 200 (no restart).
- Static consistency check: all `room_set_item` graph consumers use `products` (store `[slug]`, admin `[id]`, site-readiness).
- Codex CLI read-only re-review scoped to changed files.

## Out of scope

- Storefront, DB schema, migrations, seed, media apply, product/business rules.
- Admin alignment widget/API, Matrix board, Country apply, Willie media apply.
- Populating room_set_item↔product links (data/seed concern, not this fix).
- No commit, no push.
