# Greenwich Data → Display Parity Audit

Generated: 2026-03-19

---

## Data Chain Comparison

### Fields traced through the chain

| Field | Workbook (raw) | Ingestion JSON | Medusa API | Card rendered | PDP rendered |
|-------|---------------|----------------|------------|---------------|--------------|
| Collection display label | `collection_name_raw: "ГРИНВИЧ"` | `collection: "greenwich"` | `metadata.collection: "greenwich"` | **NOT RENDERED** | **NOT RENDERED** |
| Canonical product name | `product_name_canonical` | `title` | `title` | h3 ✓ | h1 ✓ |
| Article / product code | `product_code_normalized` | `sku` | `variants[0].sku` | **NOT RENDERED** | **NOT RENDERED** |
| Dimensions (structured) | `dimensions_normalized: {h,w,d}` | `dimensions: {h_mm,w_mm,d_mm}` | `metadata.dimensions: {h,w,d}` | **NOT RENDERED** | **NOT RENDERED** |
| Dimensions (human-readable) | `dimensions_raw: "В.630 х Ш.1244 х Гл.512"` | **NOT PRESERVED** | **NOT PRESENT** | **NOT RENDERED** | **NOT RENDERED** |
| Price | `price_normalized: 28400` | `price_kopeks: 2840000` | `prices[0].amount: 2840000` | ✓ formatRub | ✓ formatRub |
| Thumbnail | — | `thumbnail_storage_key` | `thumbnail` | ✓ img | ✓ img |
| Category | `category_raw / category_normalized` | `category_handle` | `categories[0].name` | **NOT RENDERED** | **NOT RENDERED** |
| Description | — | `description: "Greenwich — Комод"` | `description` | — | ✓ (redundant) |
| display_group | — | `display_group` | `metadata.display_group` | ✓ grouping works | N/A |
| display_group_title | — | `display_group_title: "Кровать Greenwich"` | `metadata.display_group_title` | ✓ as h3 | N/A |
| subtitle | — | — | `subtitle: null` | — | — |
| collection_id | — | — | `collection_id: null` | — | — |

---

## Exact Breakpoints

### BP-1: Collection label — NOT RENDERED

- **Root:** Workbook has `collection_name_raw: "ГРИНВИЧ"`, but only lowercase machine key `"greenwich"` reaches the API as `metadata.collection`.
- **Fix needed:** Add `metadata.collection_label: "Greenwich"` at ingestion/seed level. Render on card and PDP.

### BP-2: Article/SKU — NOT RENDERED

- **Root:** SKU is available in API (`variants[0].sku: "GR-05-1"`), but storefront `ProductCard` and PDP page never read or render it.
- **Fix needed:** Add SKU rendering to card (subtle) and PDP (prominent).

### BP-3: Dimensions — NOT RENDERED

- **Root:** Structured dimensions are in API (`metadata.dimensions: {height_mm, width_mm, depth_mm}`), but storefront ignores them.
- **Fix needed:** Add formatting function and render on card (compact) and PDP (labeled).

### BP-4: Title whitespace artifacts — PROPAGATED

- **Root:** Workbook `product_name_canonical` contains artifacts from original data entry:
  - `"Гардероб 2 -х дв.  с ящиками"` — extra spaces, space before hyphen
  - `"Кровать  1-сп. (90*200)"` — double space, `*` instead of `×`
- **Propagation:** Workbook → ingestion → Medusa → storefront — never cleaned.
- **Fix needed:** Normalize during ingestion: collapse multiple spaces, fix `*` → `×` in size notation.

### BP-5: Grouped bed card title — REDUNDANT

- **Root:** `display_group_title: "Кровать Greenwich"` was set before collection label existed. Now with collection label, the card would show "Greenwich" + "Кровать Greenwich" = redundant.
- **Fix needed:** Change `display_group_title` to `"Кровать"`. Collection label provides the collection context.

### BP-6: Description on PDP — REDUNDANT

- **Root:** `description: "Greenwich — Комод"` repeats collection + title. With collection label and h1 title now shown, this is pure repetition.
- **Status:** Low priority. Will become naturally replaced when richer product descriptions exist.
