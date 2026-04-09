# Greenwich Bed Display Fix — Report

Generated: 2026-03-19

---

## 1. Summary

Greenwich beds were rendered as 5 visually identical catalog cards (same thumbnail, same gallery), differing only by size label and price. This created a misleading impression of duplicate products.

**Root cause:** The ingestion model treated each workbook size-row as a separate Medusa product. This is correct from a commercial/SKU perspective, but wrong from a merchandising/display perspective — customers browse by design, not by size.

**Fix applied:** Backend-driven display grouping via `metadata.display_group`. The storefront now collapses products sharing a `display_group` into a single catalog card with "от" pricing and a size count hint. No architectural changes, no Greenwich-specific hacks.

---

## 2. The Problem

| Before | After |
|--------|-------|
| 5 bed cards with identical image | 1 card "Кровать Greenwich" |
| Titles: "Кровать 1-сп. (90×200)", "...120...", etc. | Title: "Кровать Greenwich" |
| 5 separate prices | "от 71 900 ₽" (cheapest size) |
| No variant info | "5 размеров" hint |
| Looked like broken duplicates | Clean merchandising |

**Why same-image multi-size cards are misleading:**
- Beds within a size range (90/120/140/160/180) share identical photography (the shared bed pool uses the same Frame/Cloud/Plane design shots)
- A customer scanning the catalog sees 5 identical-looking products and either (a) thinks the catalog is broken, (b) doesn't understand the difference, or (c) leaves
- This will recur for every collection with size-based bed variants

---

## 3. Display Model — Recommendation

### Immediate (implemented): Option D — Backend-Driven Display Group Metadata

Products that represent size variants of the same design carry `display_group` metadata. The storefront groups them into one catalog card.

**Metadata contract:**
```json
{
  "display_group": "greenwich-bed",
  "display_group_title": "Кровать Greenwich",
  "display_group_sort": 1
}
```

**Catalog behavior:**
- One card per `display_group`, positioned where the first member appears
- Title from `display_group_title`
- Price: "от {min}" across group members
- Hint: "{N} размеров"
- Links to the representative product (lowest `display_group_sort`)

**Why this model:**
- Backend-driven — grouping decision lives in product metadata
- Storefront stays thin — reads metadata, groups, renders. No business logic.
- Not Greenwich-specific — any collection can set `display_group` in ingestion data
- Graceful fallback — products without `display_group` render normally
- Reversible — metadata can be removed when the long-term model (Option B) is ready

### Long-term target: Option B — Medusa Product Variants

Re-model beds as 1 Medusa product with 5 variants (one per size). This is the correct Medusa pattern but requires a PDP variant picker and seed restructuring. Deferred.

---

## 4. Files Changed

### New files
| File | Purpose |
|------|---------|
| `apps/storefront/src/lib/display-group.ts` | Reusable display grouping utility |
| `docs/collections/greenwich/greenwich-bed-display-audit.md` | Audit findings |
| `docs/collections/greenwich/greenwich-bed-display-options.md` | Model comparison (A/B/C/D) |
| `docs/collections/greenwich/greenwich-bed-display-recommendation.md` | Recommended model with contract |
| `docs/collections/greenwich/greenwich-bed-display-fix-report.md` | This report |

### Modified files
| File | Change |
|------|--------|
| `apps/storefront/src/components/product-card.tsx` | Added `displayGroup` prop, "от" pricing, variant hint |
| `apps/storefront/src/app/catalog/page.tsx` | Added display grouping before rendering |
| `apps/storefront/src/app/kids/catalog/page.tsx` | Added display grouping (consistency) |
| `apps/storefront/src/app/globals.css` | Added `.variant-hint` style |
| `scripts/build-greenwich-ingestion.py` | Auto-generates `display_group` for bed products |
| `scripts/seed-greenwich.ts` | Includes `display_group` in product metadata on seed |
| `data/normalized/greenwich-ingestion.json` | Regenerated with `display_group` fields |

### Backend data (runtime)
| Change | Detail |
|--------|--------|
| 5 bed products metadata updated | Added `display_group`, `display_group_title`, `display_group_sort` via SQL |

---

## 5. Verification

| Check | Result |
|-------|--------|
| Storefront builds | Yes (Next.js 14 build succeeds) |
| Catalog loads | HTTP 200 |
| Bed cards collapsed | 5 → 1 card |
| Card title | "Кровать Greenwich" |
| Card price | "от 71 900 ₽" (min size price) |
| Variant hint | "5 размеров" |
| Non-bed products unaffected | All 10 other Greenwich products display normally |
| Kids catalog | Grouping applied (no kids beds yet, so no visible change) |
| No broken products | All 21 catalog cards render correctly |

---

## 6. What Was Fixed Now

1. **Metadata:** Added `display_group` to 5 bed products in DB
2. **Storefront:** Catalog groups products by `display_group`, shows one card per group
3. **Ingestion pipeline:** Updated build script and seed script to include `display_group` automatically
4. **UX:** Replaced 5 misleading duplicate cards with 1 clean card + size hint

---

## 7. What Remains for Later

| Item | Priority | Notes |
|------|----------|-------|
| PDP variant picker | Medium | Option B implementation — show all sizes on one product page |
| PDP cross-links | Low | Show "Также доступна в размерах: ..." on individual bed PDP |
| Full re-seed as Medusa variants | Medium | Consolidate 5 products → 1 product with 5 variants |
| Oliver/Willie Winkie beds | Medium | Same `display_group` pattern applies; set in their ingestion data |
| Design-family sub-groups | Low | Frame/Cloud/Plane could become separate groups within bed category |

---

## 8. Is Greenwich a Correct Reference Pattern?

**Yes.** With this fix, Greenwich demonstrates:
- Clean catalog display (no misleading duplicates)
- Backend-driven merchandising metadata
- Reusable grouping mechanism for any collection with size variants
- Graceful fallback for products without grouping
- Clear path to long-term Medusa variant model

Greenwich is ready to serve as a reference pattern for Oliver, Provence, and other collections.
