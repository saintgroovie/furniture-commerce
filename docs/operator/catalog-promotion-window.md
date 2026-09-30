# Catalog Promotion Window («Промо в каталоге»)

A separate rotating window next to the main catalog grid - in the leftover space to the right of the last catalog column. Not a grid cell, not a banner, not a second catalog.

## Product contract

| Rule | Value |
| --- | --- |
| Where | `/catalog` (any browse view with a non-empty result set - it sits outside the result list, so filters / search / sort are untouched). Kids, Rooms and Bespoke render no window |
| Position | Right page gutter, mirroring the filter card on the left: `.catalog-promo-sidebar` is an absolutely positioned height rail (= grid height) with the filter card's width formula (`--catalog-sidebar-w`, ≤ 200px); the panel inside is sticky under the header (`top: 112px`). The product grid keeps its own columns, rows and order |
| Breakpoints | Visible from **1500px** viewport (rail ≥ 150px; a 14" MacBook at 1512px gets it). Below that there is no usable leftover right of the grid → no window (it never folds into the grid or becomes a horizontal banner). Contract: `apps/storefront/src/lib/promotion-window-placement.ts` |
| Count | Exactly one window per page |
| Rotation | 6-8 s (seller value clamped), crossfade between stacked square images, pause on hover / focus / hidden tab, static under `prefers-reduced-motion`, one product = static card |
| Empty | Slot disabled, no valid products, empty result set, or backend error → plain catalog (fail-open, no window) |

## Architecture (Medusa = SoT)

```
Native Medusa price list «Промо в каталоге» (type sale, RUB)   ← commerce truth
  -> variants[].calculated_price (calculated_amount / original_amount / is_calculated_price_price_list)
  -> store loaders attach it everywhere (browse, PDP, promotion slot)
  -> metadata.buyer_default_configuration.{min_unit_price, original_min_unit_price} (tier-aware)
promotion_slot table (module `promotion-slot`, key `catalog_main`)  ← presentation only
  -> enabled, label, product_ids (order = rotation order), starts_at / ends_at, rotation_interval_ms
GET /store/woodright/promotion-slot   ← resolved items (filters below), same catalog DTO as /store/catalog-products
```

No discount amount is stored in the slot, storefront or metadata. The cart charges the same `calculated_price` the card shows.

Backend resolver skips: unpublished, BESPOKE, not purchasable, no active price-list sale (or sale not lower), no image, slot outside `starts_at` / `ends_at`. Skipped products are listed with a reason in the Admin preview.

Fail-closed rules: if the sales-policy link cannot be read, every candidate is treated as not purchasable (card hides, never oversells). The promo price list must be the oldest `sale`-type list titled «Промо в каталоге»; a same-title list of another type is a `409 catalog_promo_price_list_conflict` in Admin until renamed / deleted. Concurrent first-time creation resolves to one list (the loser deletes its empty duplicate).

### Endpoints

| Route | Role |
| --- | --- |
| `GET /store/woodright/promotion-slot` | Storefront payload (`slot`, `items[]` with `sale_price`, `original_price`, `discount_percent`, `product`) |
| `GET/PUT /admin/woodright/catalog-promo` | Slot config + products with base / sale price and blocker |
| `GET /admin/woodright/catalog-promo/products?q=` | Product picker (published, non-BESPOKE, RUB base price) |
| `PUT/DELETE /admin/woodright/catalog-promo/products/:id/discount` | Set `{ percent }` or `{ sale_price }` / `{ clear: true }` in the promo price list |
| `GET /admin/woodright/catalog-promo/preview` | What the storefront resolves right now + skipped reasons |

## Seller guide (Admin → Woodright → Промо в каталоге)

| Task | How |
| --- | --- |
| Turn the window off / on | Checkbox «Показывать промо-окно в каталоге» → «Сохранить». Storefront fetches the slot `no-store`, so the next catalog reload shows it |
| Add a product | «Добавить товар» → название / артикул / адрес → «Добавить» → enter an explicit percent or an exact ruble price (the fields start empty; there is no preset) → «Задать скидку» → «Сохранить» for the slot. Without a lower promotional price the product does not appear |
| Remove a product | «Убрать» на строке → «Сохранить» |
| Change order | ↑ / ↓ на строке → «Сохранить». Порядок = очередь ротации |
| Change the discount | «Скидка, %» starts empty, or «Цена со скидкой, ₽». Type `[процент]` or `[цена в ₽]`, check that the amount is the one you intend, then «Задать скидку» / «Обновить скидку». That writes the price list immediately and does not press «Сохранить». Saving the slot does not change prices. «Убрать скидку» deletes only the promotional price, not the base price. «Открыть карточку товара» opens the Woodright product |
| Schedule | «Показывать с» / «Показывать до» у окна; срок самой скидки - в нативном прайс-листе («Открыть прайс-лист в Medusa») |
| Preview | «Что сейчас видит покупатель» - очередь на сайте и список «Не показываются» с причиной |

Storefront reads the seller values only; no product ids or discount values are hard-coded.

## Historical launch bootstrap (deprecated, not a launch path)

This script is historical evidence. It is not the way to start a catalog promotion. Do not treat its prices, label, or enable flag as approved.

It refuses database name `woodright_public_production` in every target and mode, including `local`, before any price-list or promotion-slot read or write. The refusal code is `REFUSED_DEPRECATED_PUBLIC_PRODUCTION_PROMO_BOOTSTRAP`.

## Historical manifest record (not approved prices)

Script: `apps/backend/src/scripts/bootstrap-catalog-promo-launch.ts`
Manifest: `catalog-promo-launch-v1`, pinned SHA `f2177dee696bc6fc64600439e0f77ab896e2c70df4d9578f7b53c0ecf1671f23`

The amounts below are the frozen historical manifest. They are not a discount to enter.

| Product | id | SKU | Base at the time | Historical sale amount |
| --- | --- | --- | --- | --- |
| Комод (Greenwich) | `prod_01KM1QHNHNKSG173KZ6C2AZ5JR` | `GR-05-1` | 109 500 ₽ | 98 550 ₽ |
| Консоль (Greenwich) | `prod_01KM1QHNHNR5R4YZKQERDE8EZ6` | `GR-44-1` | 45 900 ₽ | 41 310 ₽ |

The old manifest also assumed an LDSP opening tier. Current public products do not use that tier. Do not copy those figures into Admin.

The script is not part of CMD, HEALTHCHECK, or migrate. It is not the current launch workflow. Pointing it at `woodright_public_production` stops before any write. A blank label on the live card stays blank; this manifest's old label is not a storefront fallback.

Migration: `apps/backend/src/modules/promotion-slot/migrations/Migration20260908120000.ts` (creates `promotion_slot`; additive, rollback drops the table).

## Tests

```sh
# backend
cd apps/backend && yarn test:woodright-admin
# storefront
cd apps/storefront && yarn test:fidelity
# browser (needs running stack + playwright)
WOODRIGHT_A11Y_BASE_URL=http://127.0.0.1:3150 \
WOODRIGHT_PROMO_ARTIFACT_DIR=tmp/promotion-window-qa \
  node apps/storefront/scripts/promotion-window.smoke.cjs
```

The browser smoke checks rail placement on 7 breakpoints (visible right of the grid and sticky from 1500px, absent below, grid never contains the card), rotation, pause on hover / focus, reduced motion, thumb rail a11y, and promo → PDP → cart price equality for every rotating product.
