# Product sales flow

**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725`  
**Date:** 2026-07-25

## 1. ProductClassification

**Module:** `apps/backend/src/modules/product-extension`  
**Model:** `product_classification` (`models/product-type.ts`)

```ts
product_type: model.enum(["STANDARD", "CONFIGURABLE", "BESPOKE"])
```

**Link:** `apps/backend/src/links/product-product-extension.ts` - Product ↔ ProductClassification (one-to-one at business/seed layer).

**Seed:** `apps/backend/src/scripts/seed.ts` creates a classification row per product and links it.

**Storefront read path:** prefer `product.product_classification.product_type` (legacy aliases `custom_product_type` / `productType` still checked in some CTAs).

| Type | Commerce intent |
|------|-----------------|
| `STANDARD` | Add to cart (primary CTA) |
| `CONFIGURABLE` | Add to cart + secondary “custom sizes” quote CTA |
| `BESPOKE` | Quote only - cart blocked |

---

## 2. Metadata fields (sales-relevant)

Authoritative browse allowlist: `CATALOG_METADATA_ALLOW` in  
`apps/backend/src/api/store/products/catalog-browse-projection.ts`.

**Launch / quote**

| Key | Role |
|-----|------|
| `launch_mode` | `"request_quote"` → quote CTA even if not BESPOKE (`isRequestQuoteProduct`) |
| `request_quote` | Catalog wire key (legacy/adjacent flag; primary gate is `launch_mode`) |
| `request_quote_price_label` | Optional label support on wire |
| `price_mode` | Pricing presentation hint |

**Merchandising / taxonomy**

| Key | Role |
|-----|------|
| `collection`, `collection_label`, `subcollection_label` | Collection facets |
| `category_handle` | Category |
| `buyer_item_type`, `buyer_item_type_source` | Buyer item taxonomy (distinct from ProductClassification) |
| `display_group*` / `canonical_name` | Card grouping |
| `storefront_section`, `cart_group` | Kids / cart grouping hints |
| `dimensions`, `dimensions_normalized` | Specs |

**Configuration / pricing inputs**

| Key | Role |
|-----|------|
| `material_tiers`, `material_tier_*` | Material execution + multipliers (server reprices cart) |
| `finish_color_*`, `paint_finish_*`, `fabric_upholstery_*`, `frame_material_*`, `headboard_model_*` | Finish executions / labels |
| `bed_execution_matrix`, `greenwich_paint_execution_matrix` | Matrix configs |
| `buyer_default_configuration` | Default PDP selection |
| `execution_dimension_contract`, `finish_metadata_source` | Contracts / provenance |

**Line-item metadata written by PDP add-to-cart** (`product-cta.tsx`):  
`execution_image`, `execution_specs`, `material_execution_code`, `finish_execution_key`, `storefront_section` (kids), `configuration_identity`.

---

## 3. Inventory behavior

| Finding | Detail |
|---------|--------|
| Custom inventory module / policies | **None** in Woodright backend |
| Seed `manage_inventory` / stock levels | **Not set** in `seed.ts` (variants created with title/sku/options only) |
| `only_as_set` / stock reservation custom logic | **Not found** |
| Cart pricing override | Reprices configured lines; does not implement stock checks |
| BESPOKE vs inventory | BESPOKE blocked by **classification gate**, not inventory |

**Conclusion:** Stock/inventory is default Medusa behavior (if any); Woodright sales gates are **classification + launch_mode + configured pricing**, not inventory qty.

---

## 4. Cart block for BESPOKE

**Middleware:** `apps/backend/src/api/middlewares.ts`  
**Matcher:** `POST /store/carts/:id/line-items`  
**Pure gate:** `apps/backend/src/api/cart-classification-gate.ts`

Behavior:

1. Collect `variant_id` (+ batch `items[].variant_id`).
2. Resolve product via Query Graph: `product_classification.product_type`.
3. If type `BESPOKE` → **400** `{ code: "BESPOKE_NOT_ALLOWED_IN_CART", message: "… Use the quote request form instead." }`.
4. Missing product / missing classification → **500** `PRODUCT_TYPE_VALIDATION_FAILED` (**fail-closed**).

Runs **before** the configured-pricing route override (`api/store/carts/[id]/line-items/route.ts`).

---

## 5. Current CTA mapping on PDP

Source: `apps/storefront/src/components/product-cta.tsx` + copy in `woodright-copy.ts` (`productCta`).

| Condition | Primary CTA | Secondary | Notes |
|-----------|-------------|-----------|-------|
| `product_type === "BESPOKE"` | Link → `/bespoke/request?product_id=…` (+ optional `material`) - label **«Запросить расчёт»** | - | No add-to-cart |
| `metadata.launch_mode === "request_quote"` (and not already handled as BESPOKE) | Link → same request form - **«Оставить заявку»** | Manager note under CTA | No add-to-cart |
| `product_type === "CONFIGURABLE"` | Add to cart (or «Выберите параметры» when selection incomplete) | Link quote - **«Сделать по моим размерам»** | Cart + quote |
| Else (`STANDARD` / default) | Add to cart only | - | |

Selection gate: buyer execution / material selection can disable add-to-cart until complete (`requiresBuyerSelection` / `usePdpPurchaseGate`).

---

## 6. Room-sets / `only_as_set` hints

### Room-set entity

- Module: `apps/backend/src/modules/room-set`
- Models: `room_set` (title, slug, description, hero/gallery, `price_from`, `room_type`, `style`, `is_active`), `room_set_item` (quantity, sort_order)
- Items linked to products via `links/room-set-product.ts`
- Store APIs: `/store/room-sets`, `/store/room-sets/:slug`
- Admin APIs: `/admin/room-sets` (+ id)
- Bespoke request may carry `room_set_id`

### Storefront CTA (`room-set-cta.tsx`)

| Action | Behavior |
|--------|----------|
| **«Купить комплект»** | Adds **non-BESPOKE** item variants to cart (skips BESPOKE lines); quantity from room-set item |
| **«Адаптировать под мою комнату»** | `/bespoke/request?room_set_id=…` |
| Note when bespoke items present | «Часть товаров доступна только по запросу.» |
| All items BESPOKE / none eligible | Error: quote-only / empty set |

### `only_as_set`

| Check | Result |
|-------|--------|
| Metadata key `only_as_set` / `onlyAsSet` / similar | **Not found** anywhere in worktree |
| Product flag forcing room-set-only purchase | **None** |

Room-set membership does **not** currently block individual PDP cart purchase; only BESPOKE classification / `request_quote` launch mode do.

---

## 7. End-to-end sales paths (condensed)

```
STANDARD          → PDP add-to-cart → cart → (Medusa checkout; no Woodright notify)
CONFIGURABLE      → add-to-cart and/or quote form → lead/bespoke_request rows
BESPOKE           → quote form only (cart 400)
launch_mode=request_quote → quote form only (UI); classification may still be STANDARD/CONFIGURABLE
Room set          → buy eligible lines OR adapt via bespoke request
```

No notification / email side effects on any path (see `notification-inventory.md`).
