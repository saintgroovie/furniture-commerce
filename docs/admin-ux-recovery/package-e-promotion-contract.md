# Package E — Promotion Module contract (Medusa 2.13.3)

**Source of truth:** installed packages in integration worktree (`@medusajs/medusa`, `@medusajs/promotion`, `@medusajs/utils`, `@medusajs/core-flows` — all **2.13.3**), not marketing docs.

**Live API roundtrips:** see `package-e-data-audit.md` / validation notes after isolated `:9001` smoke.

## Admin endpoints (proven)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/promotions` | Filters: `q`, `code`, `id`, `campaign_id`, dates, `$and`/`$or` |
| POST | `/admin/promotions` | `AdminCreatePromotion` (strict) |
| GET | `/admin/promotions/:id` | Resolves by `id` **or** `code` |
| POST | `/admin/promotions/:id` | Update |
| DELETE | `/admin/promotions/:id` | Hard delete via workflow — **UI uses stock Admin; Woodright prefers disable** |
| GET | `/admin/promotions/:id/:rule_type` | `rules` \| `target-rules` \| `buy-rules` |
| POST | `/admin/promotions/:id/rules/batch` | `{ create, update, delete }` |
| POST | `/admin/promotions/:id/target-rules/batch` | same |
| POST | `/admin/promotions/:id/buy-rules/batch` | same |
| GET | `/admin/promotions/rule-attribute-options/:rule_type` | Helper catalog |
| GET | `/admin/promotions/rule-value-options/:rule_type/:rule_attribute_id` | Searchable values |

**Status:** no dedicated activate endpoint. Field `status` on create/update. Default create status = **`draft`**.

## Campaigns

| Method | Path | Notes |
|--------|------|-------|
| CRUD | `/admin/campaigns` | Create requires `name` + `campaign_identifier` |
| POST | `/admin/campaigns/:id/promotions` | `{ add, remove }` |

Budget types: `spend`, `usage`, `use_by_attribute`, `spend_by_attribute`.  
`currency_code` required for `spend`, forbidden for `usage`. Budget **type** immutable after create; update budget allows `limit` only.

## Enums (runtime)

| Enum | Values |
|------|--------|
| `PromotionType` | `standard`, `buyget` |
| `PromotionStatus` | `draft`, `active`, `inactive` |
| `ApplicationMethodType` | `fixed`, `percentage` |
| `ApplicationMethodTargetType` | `order`, `shipping_methods`, `items` |
| `ApplicationMethodAllocation` | `each`, `across`, `once` |
| `PromotionRuleOperator` | `gte`, `lte`, `gt`, `lt`, `eq`, `ne`, `in` (UI helpers expose mainly `in`/`eq`/`ne`) |
| `CampaignBudgetType` | `spend`, `usage`, `use_by_attribute`, `spend_by_attribute` |

### Not a first-class type

- **`free_shipping`:** not an application method type. Approximate via `percentage` + `value: 100` + `target_type: shipping_methods` — Woodright keeps this **stock Admin fallback** until shipping options + cart path are proven end-to-end.
- **Buy X Get Y:** `type: buyget` with `buy_rules`, `apply_to_quantity`, `buy_rules_min_quantity`, `max_quantity` — supported in schema; wizard only after live smoke; until then **stock Admin fallback**.

## Application method constraints (module validation)

- `allocation` **required** when `target_type` is `items` or `shipping_methods`
- `across` forbids `max_quantity`
- `each` / `once` **require** `max_quantity`
- `once` incompatible with `target_type: order`
- `buyget` requires `apply_to_quantity`, `buy_rules_min_quantity`, `max_quantity` (≥ apply_to)
- Percentage: `0 < value <= 100`
- Fixed: `value` is a number; **`currency_code` required** (also modeled as disguised rule `currency_code`)

## Rule attributes (helper map)

### Condition rules (`rules`)

| Operator label | Attribute path |
|----------------|----------------|
| Customer group | `customer.groups.id` |
| Region | `region.id` |
| Country | `shipping_address.country_code` |
| Sales channel | `sales_channel_id` |
| Currency (fixed) | `currency_code` → application method |

### Target / buy rules (items)

| Selector | Attribute path |
|----------|----------------|
| Product | `items.product.id` |
| Category | `items.product.categories.id` |
| Collection | `items.product.collection_id` |
| Product type (Medusa) | `items.product.type_id` |
| Tag | `items.product.tags.id` |

### Shipping target

| Selector | Attribute path |
|----------|----------------|
| Shipping option type | `shipping_methods.shipping_option.shipping_option_type_id` |

### Fail-closed / unsupported in Woodright wizard

- **Variant ID targeting** is **not** in the official rule-attribute map → do **not** claim variant-granular promotions; use product IDs (and document).
- Woodright **ProductClassification** ≠ Medusa **product type** — never mix selectors.
- Unknown attributes → stock Admin.

### Include / exclude

Operators include `in`, `eq`, `ne`. Exclusion is modeled with `ne` / opposite selection — not a separate Medusa “exclude list” entity. UI maps “исключить” to proven operators only.

## Amount units (E3)

| Context | Unit |
|---------|------|
| Variant / cart money amounts | **Major** currency units (RUB rubles, not kopecks) |
| Fixed promotion `value` | Same major units — compared directly to line/order totals in `@medusajs/utils` promotion totals |
| Percentage `value` | Percent number `0 < n ≤ 100` |

Do **not** assume Package C price adapter needs ×100. Package E uses dedicated promotion amount parsers/formatters with roundtrip tests.

## Store cart promotion API

| Method | Path | Body |
|--------|------|------|
| POST | `/store/carts/:id/promotions` | `{ promo_codes: string[] }` ADD (empty = REPLACE/clear) |
| DELETE | `/store/carts/:id/promotions` | `{ promo_codes: string[] }` REMOVE |
| Create cart | `promo_codes` accepted in schema | **Currently no-op** under Woodright patch |

### Critical: postinstall patch (Medusa #14149)

`apps/backend/scripts/patch-skip-cart-promotions.mjs` removes automatic `updateCartPromotionsWorkflow` from `create-carts` and `refresh-cart-items`.

Implications for Package E:

1. Automatic promotions do **not** apply on cart create / line-item refresh.
2. Explicit `POST /store/carts/:id/promotions` is the verification path for **codes**.
3. That endpoint may still hit #14149 when automatic promotions exist — **smoke required**; if broken, automatic cart verification stays fail-closed / documented.
4. Never invent frontend discount math as success proof.

## Safe create defaults (Woodright)

- Prefer `status: "draft"` / inactive create (“Создать как выключенную”).
- `code` is **required** even for `is_automatic: true` (API schema).
- Do not auto-activate after create unless operator chooses “Создать и включить”.
- Prefer `status: "inactive"` for reversible disable; delete → stock Admin.

## Example payloads (schema-proven)

See research notes; live IDs filled during fixtures on `medusa-admin-ux-b5` only.
