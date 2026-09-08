# Catalog Promotion Window («Промо в каталоге»)

One special cell in the main catalog grid that rotates discounted products. Not a banner, not a second catalog.

## Product contract

| Rule | Value |
| --- | --- |
| Where | `/catalog` default view only (no search, type, category, collection, price filter or explicit sort). Kids, Rooms, Bespoke and filtered / sorted result sets render the plain grid |
| Position | Last cell of the first row on the widest breakpoint. `.catalog-product-grid` is 3 columns on desktop, so the card is DOM index 2 (`PROMOTION_SLOT_INDEX = CATALOG_DESKTOP_COLUMNS - 1`). On 2 / 1 column breakpoints it flows with the grid |
| Count | Exactly one card per result set. Never padded with placeholder cards; a shorter result set puts the card last |
| Rotation | 6-8 s (seller value clamped), crossfade between stacked square images, pause on hover / focus / hidden tab, static under `prefers-reduced-motion`, one product = static card |
| Empty | Slot disabled, no valid products, or backend error → plain catalog (fail-open, no card) |

The spec assumed a 4-column desktop grid; the live grid is 3 columns and is kept as-is (search bubble alignment depends on it). The contract «special cell closes the first row» is preserved.

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
| `PUT/DELETE /admin/woodright/catalog-promo/products/:id/discount` | Set `{ percent }` or `{ amount }` / clear the sale price in the promo price list |
| `GET /admin/woodright/catalog-promo/preview` | What the storefront resolves right now + skipped reasons |

## Seller guide (Admin → Woodright → Промо в каталоге)

| Task | How |
| --- | --- |
| Turn the window off / on | Checkbox «Показывать промо-окно в каталоге» → «Сохранить». Storefront fetches the slot `no-store`, so the next catalog request reflects it (regular product cards keep the catalog list cache, ≤ 60 s) |
| Add a product | «Добавить товар» → type name / SKU / handle → «Добавить» → «Сохранить». A product without a discount shows «Скидка не задана - товар не показывается» until a discount is set |
| Remove a product | «Убрать» on the product row → «Сохранить» |
| Change order | ↑ / ↓ on the row → «Сохранить». Order = rotation order |
| Change the discount | «Скидка, %» → «Обновить скидку» (writes the sale price into the native price list immediately; no «Сохранить» needed). «Убрать скидку» clears it |
| Schedule | «Показывать с» / «Показывать до» on the slot; discount validity itself lives on the native price list («Открыть прайс-лист в Medusa») |
| Preview | Section «На сайте» shows the resolved rotation and skipped products with reasons |

Storefront reads the seller values only; no product ids or discount values are hard-coded.

## Launch bootstrap (idempotent, fail-closed)

Script: `apps/backend/src/scripts/bootstrap-catalog-promo-launch.ts`
Manifest: `catalog-promo-launch-v1`, pinned SHA `f2177dee696bc6fc64600439e0f77ab896e2c70df4d9578f7b53c0ecf1671f23`

| Product | id | SKU | Base | Sale (−10 %) |
| --- | --- | --- | --- | --- |
| Комод (Greenwich) | `prod_01KM1QHNHNKSG173KZ6C2AZ5JR` | `GR-05-1` | 109 500 ₽ | 98 550 ₽ |
| Консоль (Greenwich) | `prod_01KM1QHNHNR5R4YZKQERDE8EZ6` | `GR-44-1` | 45 900 ₽ | 41 310 ₽ |

Card / PDP / cart show the tier-aware opening price (LDSP tier): 68 985 ₽ вместо 76 650 ₽ and 28 917 ₽ вместо 32 130 ₽.

| Variable | Staging | Production |
| --- | --- | --- |
| `CATALOG_PROMO_TARGET` | `staging` | `production` |
| `CATALOG_PROMO_MODE` | `dry-run` / `apply` | same (required) |
| `DATABASE_URL` | db name exact `woodright_staging` | exact `woodright_production` |
| `CATALOG_PROMO_CONFIRM` | unset | `CATALOG_PROMO_LAUNCH_V1_PRODUCTION_OWNER_APPROVED` |
| `CATALOG_PROMO_PRODUCTION_ACK` | unset | `I_UNDERSTAND_THIS_WRITES_PRODUCTION` |

```sh
CATALOG_PROMO_TARGET=production CATALOG_PROMO_MODE=dry-run \
  npx medusa exec ./src/scripts/bootstrap-catalog-promo-launch.ts
```

The script verifies every manifest product against the live DB (id, handle, SKU, base price), creates the price list once, upserts exactly two sale prices, upserts the `catalog_main` slot and prints a before / after diff. A second `apply` is a no-op. Any mismatch → `FAIL_CLOSED`, nothing written.

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

The browser smoke checks placement on 4 breakpoints, rotation, pause on hover / focus, reduced motion, thumb rail a11y, and promo → PDP → cart price equality for every rotating product.
