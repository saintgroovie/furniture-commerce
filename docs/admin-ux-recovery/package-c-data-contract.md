# Package C — data contract (Medusa 2.13.3)

## Source of truth

| Concern | SoT |
|---------|-----|
| Product | Medusa `product` |
| Options / values | `product_option` / `product_option_value` |
| Variants | `product_variant` |
| Prices | Pricing module `price` via variant ↔ price_set link |
| Classification | `product_classification.product_type` (Woodright) |

Package C does **not** introduce variant/price entities.

## Admin API (confirmed)

### Read product + variants + prices

```
GET /admin/products/:id?fields=id,title,handle,status,*options,*options.values,*variants,*variants.options,*variants.prices,*product_classification
```

Optional dedicated variants list (Package B already uses a subset):

```
GET /admin/products/:id/variants?fields=id,sku,title,*prices,*options&limit=100
```

### Update one variant (SKU / simple prices)

```
POST /admin/products/:id/variants/:variant_id
Body: {
  sku?: string | null,
  prices?: Array<{ id?: string, amount: number, currency_code: string }>
}
```

Workflow: `updateProductVariantsWorkflow`.

Response returns the parent `product` (refetch). Always re-fetch authoritative variant prices after save.

### Proven mutation semantics (isolated DB, 2026-07-12)

| Experiment | Result |
|------------|--------|
| `prices: [{ id, amount, currency_code }]` | Updates that price |
| Include RUB + new USD in `prices` | Both present |
| Then send **only** RUB in `prices` | **USD deleted** → `prices` is **full replacement** |
| Body `{ sku }` without `prices` | SKU changes; prices untouched |
| `prices: []` | **All prices removed** |
| Add `{ amount, currency_code }` when none exist | Creates simple price |

**Safety rules for Package C**

1. Omit `prices` key entirely for SKU-only updates.
2. Never send `prices: []`.
3. On any price edit, rebuild payload with **all** current prices that must survive (by `id` + amount + currency), applying the operator change to exactly one target currency.
4. If the variant has any **non-editable** price (see below), **block all price mutations** for that variant and offer stock Admin fallback.
5. Multi-currency: require explicit currency selection; never silently pick among several editable currencies.

## Observed AdminPrice shape (2.13.3)

```json
{
  "id": "price_…",
  "amount": 12500,
  "currency_code": "rub",
  "min_quantity": null,
  "max_quantity": null,
  "variant_id": "variant_…",
  "rules": {}
}
```

### Amount units

Major currency units in Admin JSON for RUB fixtures (`12500` → `12 500 ₽`). Do not divide/multiply by 100.

### Simple vs complex price

| Condition | Treatment in Package C |
|-----------|-------------------------|
| `rules` empty/`{}`/`null` AND `min_quantity`/`max_quantity` null/undefined | **Editable** simple currency price |
| `Object.keys(rules\|\|{}).length > 0` | **Non-editable** (rule-based) |
| `min_quantity` or `max_quantity` not null | **Non-editable** (quantity-tier) |
| Duplicate simple prices same currency | **Non-editable** ambiguous; fallback |
| Missing prices array / empty | Missing price (attention); may **add** one simple currency if no complex prices on variant |
| Amount `0` with valid currency | Zero price (valid, distinct from missing) |

Price-list linkage is **not** reliably exposed on AdminPrice in 2.13.3 responses inspected here. Package C therefore treats rule/min/max/duplicate-currency as the complex gate. If linkage appears later without those signals, operator still has stock Admin fallback.

## Option ↔ variant link

Variant `options[]` entries include `value`, `option_id`, and nested `option.title`. Matrix columns are built from product-level `options[]`, filled per variant by matching `option_id` / option title.

## Editing limits (Package C)

- Edit SKU on existing variants.
- Edit/add **simple** RUB (or single-currency) prices only when contract above holds.
- No price delete.
- No option create/delete.
- No automatic variant generation.
- Bulk only over explicitly selected rows; preview + partial failure report required.
- Create/delete variant: stock Admin fallback (ambiguous / high blast radius).

## Query discipline

- One product ID scope only.
- Cap variants page size (100+) with explicit note if truncated.
- AbortController on navigation/id change.
- Invalidate only current product queries after save.
