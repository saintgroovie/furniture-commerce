# Greenwich Bed Display — Recommended Model

---

## Recommendation: Option D now, migrate to Option B later

### Immediate fix (this task): Option D — Backend-Driven Display Group

**What:** Add `metadata.display_group` and `metadata.display_group_title` to the 5 bed products. Update storefront catalog to group products sharing a `display_group` into a single card with "от X ₽" pricing and "N размеров" hint.

**Why this is the right immediate fix:**
1. **Backend-driven** — grouping decision lives in product metadata (backend = source of truth)
2. **Storefront stays thin** — catalog just reads `display_group` and collapses; no business logic, no heuristics
3. **Not Greenwich-specific** — any future collection with size variants sets `display_group` in its ingestion data
4. **No re-seed needed** — metadata update via SQL; existing products/categories/assets untouched
5. **Low risk** — if `display_group` is missing, products render normally (graceful fallback)
6. **Reversible** — when Option B is implemented, `display_group` becomes unnecessary and can be removed

### Long-term target: Option B — Medusa Product Variants

**What:** Re-model size-based beds as a single Medusa product with variant per size. Each variant carries its own SKU and price. PDP gets a standard variant picker.

**Why this is the correct final model:**
- Matches Medusa's design intent (product → variants → options)
- Eliminates artificial product proliferation
- Enables proper PDP variant selection
- Standard e-commerce pattern
- Cart operates on variant_id (correct Medusa flow)

**When:** After PDP variant picker component exists and ingestion pipeline supports variant-based seeding. Not in this task.

---

## Display Group Contract

Products in a display group share:
- The same visual identity (thumbnail, gallery)
- The same product category
- The same collection

Products in a display group differ by:
- Size / dimensional option
- Price (size-dependent)
- SKU

### Metadata schema

```json
{
  "display_group": "greenwich-bed",
  "display_group_title": "Кровать Greenwich",
  "display_group_sort": 1
}
```

- `display_group` — stable group key, unique across catalog
- `display_group_title` — human-readable card title for grouped display
- `display_group_sort` — sort order within group (smallest size = 1, used to pick representative card)

### Catalog behavior

When products share a `display_group`:
1. Show **one card** per group
2. Card image = thumbnail of `display_group_sort: 1` product (or first in group)
3. Card title = `display_group_title`
4. Card price = "от {min_price}" where min_price is the cheapest in group
5. Card links to the representative product
6. Badge or hint: "5 размеров" (count of products in group)

### PDP behavior (deferred)

Current PDP shows the individual product. Future enhancement: show links to other sizes in the group.

---

## Scope of changes (this task)

1. **Backend data:** Update metadata for 5 bed products (SQL)
2. **Storefront catalog:** Group products by `display_group` before rendering
3. **Storefront ProductCard:** Support "от" pricing and size count hint
4. **No changes to:** Seed script, asset model, PDP page, cart, checkout, other products
