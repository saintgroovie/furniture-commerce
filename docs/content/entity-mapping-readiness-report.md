# Entity Mapping Readiness Report

Отчёт о готовности entity mapping layer к seed generation.

---

## Executive Summary

**109 products** полностью entity-mapped.
**81 seed-ready**, **28 seed-ready with caveats**.
**3 коллекции**, **17 категорий**, **444 asset references**.
Проект **готов к seed generation planning**.

---

## Mapping Coverage

| Metric | Value |
|--------|-------|
| Total entity-mapped | 109 |
| Seed-ready (no caveats) | 81 |
| Seed-ready (with caveats) | 28 |
| Total excluded | 233 |
| Collections in mapping | 3 |
| Categories in mapping | 17 |
| Product types | CONFIGURABLE: 105, STANDARD: 4 |

### Per Collection

| Collection | Ready | Caveat | Total |
|-----------|-------|--------|-------|
| Oliver | 56 | 11 | 67 |
| Provence | 23 | 6 | 29 |
| Country-London-Paris | 2 | 11 | 13 |
| **Total** | **81** | **28** | **109** |

### Categories Represented

| Handle | Title | Products |
|--------|-------|----------|
| krovati | Кровати | 23 |
| stoly | Столы | 21 |
| shkafy | Шкафы | 12 |
| polki | Полки | 9 |
| stellazhi | Стеллажи | 8 |
| komody | Комоды | 7 |
| tumby | Тумбы | 7 |
| zerkala | Зеркала | 5 |
| skameyki | Скамейки | 4 |
| stulya | Стулья | 3 |
| divany | Диваны | 3 |
| bortiki | Бортики | 2 |
| sunduki | Сундуки | 1 |
| chasy | Часы | 1 |
| konsoli | Консоли | 1 |
| kresla | Кресла | 1 |
| baldahiny | Балдахины | 1 |

---

## Asset Coverage in Mapping

| Metric | Value |
|--------|-------|
| Products with main image | 94 |
| Products with gallery | 76 |
| Total upload manifest refs | 444 |
| Products without main (gallery-as-main) | 15 |

---

## Excluded Items (233)

| Category | Count | Meaning |
|----------|-------|---------|
| `no_confirmed_assets` | 86 | No downloaded/processed images |
| `unresolved_mapping` | 84 | Fuzzy or PDF match not confirmed |
| `blocked_by_business_decision` | 63 | VV painting modeling unresolved |

### By Collection (excluded)

| Collection | Count | Primary reason |
|-----------|-------|---------------|
| Willie Winkie | 44 | VV business decision |
| Monchelsea | 32+ | No processed assets |
| Princess Rose | 20 | No processed assets |
| Oxford | 23 | Unresolved mapping |
| Greenwich | 12 | Unresolved mapping |

---

## What seed.ts Will Need

### Data Inputs

1. **`entity-mapping.json`** — 109 products with all Medusa fields
2. **`ASSET_BASE_URL`** — environment variable for public URL prefix
3. **Region** — "Россия", RUB (already in current seed.ts)

### Entities to Create

| Entity | Count | Source |
|--------|-------|--------|
| `ProductCollection` | 3 | Oliver, Provence, Country-London-Paris |
| `ProductCategory` | 17 | From workbook categories |
| `Product` | 109 | One per workbook row |
| `ProductVariant` | 109 | One per product (Default) |
| `ProductClassification` | 109 | CONFIGURABLE (105) + STANDARD (4) |
| `ProductImage` | 444 | From upload manifest |

### Workflow

```
1. Create collections (3)
2. Create categories (17) — expand from current 4
3. Create products (109) with variants, images, prices
4. Link products → collections
5. Link products → categories
6. Link products → ProductClassification
7. Set up inventory (stock location + levels)
```

---

## Is the Project Ready for Seed Generation?

**Yes, with the following prerequisites:**

| Prerequisite | Status |
|-------------|--------|
| Entity mapping complete | **Done** (109 products) |
| Asset binding complete | **Done** |
| Upload manifest built | **Done** (441 files) |
| Storage strategy documented | **Done** |
| URL mapping documented | **Done** |
| **Processed assets uploaded to storage** | **Not done** |
| **ASSET_BASE_URL determined** | **Not done** |

### Minimum Steps to First Seed

1. **Upload assets** — copy processed files to Medusa uploads dir (~10 min)
2. **Set ASSET_BASE_URL** — `http://localhost:9000/uploads` for dev
3. **Generate seed.ts** — from entity-mapping.json (~4-8 hours development)
4. **Run seed** — `npx medusa exec ./src/scripts/seed.ts`
5. **Verify** — check Admin dashboard and storefront

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/assets/entity-mapping-strategy.md` | Strategy, rules, modeling decisions |
| `docs/content/entity-mapping-readiness-report.md` | This report |
| `data/normalized/entity-mapping.schema.json` | JSON Schema |
| `data/normalized/entity-mapping.json` | 109 mapped products |
| `data/normalized/entity-mapping-summary.json` | Summary stats |
| `data/normalized/entity-mapping-excluded.json` | 233 excluded items |

---

## Recommended Next Step

**Upload processed assets to local Medusa storage, then generate seed.ts.**

```bash
# 1. Upload assets to Medusa uploads
mkdir -p apps/backend/uploads/products
cp -r data/processed/storefront-assets/* apps/backend/uploads/products/

# 2. Generate new seed.ts from entity-mapping.json
# (development task — replace current placeholder products)

# 3. Run seed
cd apps/backend && npx medusa exec ./src/scripts/seed.ts
```
