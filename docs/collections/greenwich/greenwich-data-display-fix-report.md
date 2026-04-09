# Greenwich Data → Display Parity Fix Report

Generated: 2026-03-19

---

## 1. Summary

Greenwich catalog cards and PDP were missing critical product metadata: collection label, article number, and dimensions were present in the backend but never rendered by the storefront. Additionally, product titles contained whitespace artifacts from the original workbook, and the grouped bed card duplicated "Greenwich" in its title.

All six identified breakpoints have been fixed. Greenwich products now display a structured hierarchy: collection label, canonical name, article, dimensions, and price — driven entirely by backend metadata with graceful fallback for products lacking it.

---

## 2. Exact Breakpoints Found and Fixed

| ID | Breakpoint | Root Cause | Fix |
|----|-----------|------------|-----|
| BP-1 | Collection label not rendered | Only machine key `"greenwich"` in metadata; no display label | Added `metadata.collection_label: "Greenwich"` to all 15 products (DB + ingestion + seed) |
| BP-2 | Article/SKU not rendered | SKU available in API (`variants[0].sku`) but storefront ignores it | Added article rendering to card (context line) and PDP |
| BP-3 | Dimensions not rendered | Structured dimensions in API (`metadata.dimensions`) but storefront ignores them | Added formatting functions (`compact` for card, `labeled` for PDP) and rendering |
| BP-4 | Title whitespace artifacts | NBSP (U+00A0), double spaces, `*` instead of `×` from workbook — never cleaned | Added `_normalize_title()` to build script; cleaned titles in DB |
| BP-5 | Grouped bed card title redundant | `display_group_title` was `"Кровать Greenwich"` + collection label = double "Greenwich" | Changed `display_group_title` to `"Кровать"` |
| BP-6 | Next.js data cache stale | `fetch()` cached API responses indefinitely | Added `cache: "no-store"` to `medusaFetch()` |

---

## 3. Files Changed

### New files
| File | Purpose |
|------|---------|
| `apps/storefront/src/lib/product-metadata.ts` | Helpers: `getCollectionLabel()`, `getArticle()`, `getDimensions()`, `formatDimensionsCompact()`, `formatDimensionsLabeled()` |
| `docs/collections/greenwich/greenwich-data-display-parity-audit.md` | Full data chain audit with breakpoint analysis |
| `docs/collections/greenwich/greenwich-display-parity-model.md` | Display model specification for cards and PDP |
| `docs/collections/greenwich/greenwich-data-display-fix-report.md` | This report |

### Modified files
| File | Change |
|------|--------|
| `apps/storefront/src/components/product-card.tsx` | Added context line (collection · article), dimensions, metadata-aware imports |
| `apps/storefront/src/app/product/[id]/page.tsx` | Added collection label, article, dimensions to PDP; removed redundant description |
| `apps/storefront/src/app/globals.css` | Added styles: `.card-context`, `.card-dimensions`, `.pdp-collection-label`, `.pdp-article`, `.pdp-dimensions` |
| `apps/storefront/src/lib/api/base.ts` | Added `cache: "no-store"` to prevent stale API data |
| `scripts/build-greenwich-ingestion.py` | Added `collection_label`, `_normalize_title()`, updated `display_group_title` |
| `scripts/seed-greenwich.ts` | Added `collection_label` to metadata in seed |
| `data/normalized/greenwich-ingestion.json` | Regenerated with all fixes |

### Backend data (runtime SQL)
| Change | Detail |
|--------|--------|
| 15 products: `metadata.collection_label` added | `"Greenwich"` |
| 15 products: titles cleaned | NBSP removed, double spaces collapsed, `*` → `×` |
| 15 products: descriptions updated | Match cleaned titles |
| 5 beds: `display_group_title` changed | `"Кровать Greenwich"` → `"Кровать"` |

---

## 4. How Regular Cards Now Render

```
┌────────────────────────────────┐
│         [product image]        │
├────────────────────────────────┤
│ Greenwich · GR-05-1            │  ← collection + article
│ Комод                          │  ← h3, canonical name
│ 1244 × 512 × 630              │  ← dimensions (W × D × H)
│ 109 500 ₽                     │  ← price
└────────────────────────────────┘
```

- 10 regular Greenwich cards show full structured layout
- Demo products (no metadata) show only title + price — graceful fallback

---

## 5. How Grouped Bed Card Now Renders

```
┌────────────────────────────────┐
│         [bed image]            │
├────────────────────────────────┤
│ Greenwich                      │  ← collection only (no article — multiple SKUs)
│ Кровать                        │  ← h3, group title (no redundant "Greenwich")
│ от 71 900 ₽                   │  ← min price
│ 5 размеров                    │  ← variant count
└────────────────────────────────┘
```

- Article and dimensions omitted (vary by size within group)
- No duplicate cards — 5 beds collapsed to 1

---

## 6. How PDP Now Renders

```
Greenwich                         ← collection label
Комод                             ← h1, canonical name
Арт. GR-05-1                     ← article
Ш. 1244 × Гл. 512 × В. 630 мм   ← labeled dimensions
109 500 ₽                        ← price
[Add to cart]
```

- All metadata-driven fields are conditional — products without metadata render cleanly
- Description field removed (was redundant: "Greenwich — Комод" = collection + title)

---

## 7. Data Chain — End-to-End Status

| Field | Workbook → Ingestion | Ingestion → Medusa | Medusa → API | API → Card | API → PDP |
|-------|:---:|:---:|:---:|:---:|:---:|
| Collection label | ✓ | ✓ | ✓ | ✓ | ✓ |
| Canonical name | ✓ (cleaned) | ✓ | ✓ | ✓ | ✓ |
| Article/SKU | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dimensions | ✓ | ✓ | ✓ | ✓ (compact) | ✓ (labeled) |
| Price | ✓ | ✓ | ✓ | ✓ | ✓ |
| Display group | ✓ | ✓ | ✓ | ✓ | N/A |
| Thumbnail/images | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 8. Remaining Caveats

| Item | Priority | Notes |
|------|----------|-------|
| PDP size cross-links | Medium | Clicking grouped card → goes to 90cm bed PDP; no links to other sizes yet |
| Medusa variant model | Medium | Long-term: consolidate 5 bed products into 1 product with 5 variants |
| Richer descriptions | Low | Current descriptions are generated ("Greenwich — Комод"); need real marketing copy |
| Dimension order labels on card | Low | Card shows compact `W × D × H` without labels; users may not know which is which |
| Demo product cleanup | Low | Demo products show only title + price (no metadata); acceptable for dev |

---

## 9. Is Greenwich Now a True Reference Pattern?

**Yes.** Greenwich now demonstrates the complete end-to-end flow:

1. **Workbook** → canonical identity preserved, artifacts cleaned
2. **Ingestion** → structured metadata including collection_label, dimensions, display_group
3. **Medusa** → product data with all metadata correctly seeded
4. **API** → metadata available in store API response
5. **Catalog card** → structured hierarchy: collection · article, name, dimensions, price
6. **Grouped card** → single card per design family, "от" pricing, variant count
7. **PDP** → collection label, canonical name, article, labeled dimensions, price
8. **Fallback** → products without metadata render cleanly (no broken elements)

This pattern is directly reusable for Oliver, Provence, and future collections — they just need to set the same metadata fields in their ingestion data.
