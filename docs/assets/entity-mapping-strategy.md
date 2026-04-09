# Entity Mapping Strategy

Как workbook products маппятся на Medusa entities.

---

## Medusa Entity Model (Current)

From the existing `seed.ts`:

| Entity | How created | Current state |
|--------|------------|---------------|
| `Product` | `createProductsWorkflow` | 15 placeholder products |
| `ProductCategory` | `productModule.createProductCategories` | 4 categories (столы, тумбы, шкафы, стулья) |
| `ProductCollection` | Not used | — |
| `ProductVariant` | Inline in product creation | 1 variant per product (Default) |
| `ProductClassification` | Custom module | STANDARD / CONFIGURABLE / BESPOKE |
| `RoomSet` | Custom module | 5 demo sets |

---

## Mapping Rules

### Product

Each workbook row → one Medusa Product.

| Workbook field | Medusa field | Transformation |
|---------------|-------------|----------------|
| `canonical_name` | `title` | As-is (Russian) |
| `product_code_normalized` (lowercase) | `handle` | `ol-01-2` |
| `product_code_normalized` | variant `sku` | `OL-01-2` |
| — | `description` | Empty for now (future: from legacy site) |
| — | `status` | `"published"` |
| `price_normalized` | variant `prices[0].amount` | × 100 (kopeks), currency `rub` |
| upload manifest `target_storage_key` | `images[]` | `{ASSET_BASE}/{key}` |

**Important:** Products with the same base code but different suffixes (e.g., OL-05-1, OL-05-2, OL-05-3) are **separate products**, not variants. The workbook treats each as a distinct item with unique name, price, and dimensions.

### Collection

Each workbook `collection_name_normalized` → one `ProductCollection`.

| Workbook collection | Medusa handle | Medusa title |
|--------------------|---------------|-------------|
| `oliver` | `oliver` | Oliver |
| `provence` | `provence` | Provence |
| `country-london-paris` | `country-london-paris` | Country London Paris |
| `monchelsea` | `monchelsea` | Monchelsea |
| `princess-rose` | `princess-rose` | Princess Rose |
| `greenwich` | `greenwich` | Greenwich |
| `oxford` | `oxford` | Oxford |
| `willie-winkie` | `willie-winkie` | Willie Winkie |
| `accessories` | `accessories` | Аксессуары |

**Only Oliver, Provence, and Country-London-Paris** are included in the first seed pass.

### Category

Workbook `category_normalized` → expanded `ProductCategory` set.

| Workbook category | Medusa handle | Medusa title |
|-------------------|---------------|-------------|
| `wardrobe` | `shkafy` | Шкафы |
| `table` | `stoly` | Столы |
| `bed` | `krovati` | Кровати |
| `shelf` | `polki` | Полки |
| `nightstand` | `tumby` | Тумбы |
| `dresser` | `komody` | Комоды |
| `mirror` | `zerkala` | Зеркала |
| `bookcase` | `stellazhi` | Стеллажи |
| `chair` | `stulya` | Стулья |
| `sofa` | `divany` | Диваны |
| `bench` | `skameyki` | Скамейки |
| `console` | `konsoli` | Консоли |
| `bed-guard` | `bortiki` | Бортики |
| `clock` | `chasy` | Часы |
| `chest` | `sunduki` | Сундуки |
| `canopy-frame` | `baldahiny` | Балдахины |
| `armchair` | `kresla` | Кресла |

### Variant

MVP strategy: **one variant per product** (matching current seed.ts pattern).

```typescript
variants: [{
  title: product.title,
  sku: product.product_code_normalized,
  options: { Default: "Default" },
  prices: [{ amount: product.price * 100, currency_code: "rub" }],
}]
```

Future: finish/color options can become true variants when business confirms variant axes.

### ProductClassification

All bound furniture products → `CONFIGURABLE` (they support custom finishes even if currently single-variant).

Exception: accessories without finish options → `STANDARD`.

### Images

From upload manifest, products get `images[]` array:

```typescript
images: [
  { url: `${ASSET_BASE}/products/oliver/OL-01-2_main.jpg` },      // thumbnail
  { url: `${ASSET_BASE}/products/oliver/OL-01-2_gallery_01.jpg` }, // gallery
  { url: `${ASSET_BASE}/products/oliver/OL-01-2_gallery_02.jpg` },
]
```

Color variant images are **not** product-level images — they will attach to variant-level options when variant modeling matures.

---

## What Remains Excluded

### VV Blocked (48 items)

Willie Winkie painted variants require a business decision:
- Are VV paintings variants of base products? → Would need variant-level modeling
- Are VV paintings separate products? → Would need separate Product entities
- The painting theme (fairy tale characters) is not a generic "color" option

**Rule:** Do not force VV paintings into generic color variants. Exclude from initial seed until business model is confirmed.

### Unresolved Items (112 items)

- 52 fuzzy-unconfirmed
- 32 PDF-unconfirmed
- 28 no image source

These lack confirmed asset bindings and cannot be reliably seeded.

### No Processed Assets (58 items)

Products in Monchelsea, Princess Rose, Greenwich, Accessories — not yet downloaded/processed.

---

## Explicit Modeling Rules

### 1. STANDARD vs CONFIGURABLE

- Furniture items default to `CONFIGURABLE` — all Woodright furniture supports custom finishes
- Accessories (hooks, handles, clocks) → `STANDARD` unless business says otherwise
- `BESPOKE` is not used for workbook products — reserved for custom-order items

### 2. Children's Collections

- Oliver is a children's collection but follows standard furniture modeling
- Willie Winkie (ВВ) has themed painting variants → **excluded** until business decides:
  - Whether paintings are product variants or separate products
  - How to present 15+ fairy-tale themes in the storefront
  - Whether VV products share base product images or need unique painted images

### 3. Low-Quality Assets

- Products with quality caveats (`gallery_only`, `legacy_fallback`, `low_res_temporary`) **are included** in entity mapping
- Their `asset_quality_status` is preserved in the mapping
- PV-68-1 (`needs_reshoot`) is included but flagged prominently

---

## What seed.ts Will Need

```typescript
// Inputs
const ASSET_BASE = process.env.ASSET_BASE_URL || "http://localhost:9000/uploads"
const COLLECTIONS = [...]   // from entity-mapping.json
const CATEGORIES = [...]    // from entity-mapping.json (expanded set)
const PRODUCTS = [...]      // from entity-mapping.json

// Each product:
{
  title: "Шкаф для одежды 1-дв. с зеркалом",
  handle: "ol-01-2",
  status: "published",
  collection_handle: "oliver",
  category_handle: "shkafy",
  product_type: "CONFIGURABLE",
  images: [
    { url: `${ASSET_BASE}/products/oliver/OL-01-2_main.jpg` },
    { url: `${ASSET_BASE}/products/oliver/OL-01-2_gallery_01.jpg` },
  ],
  variants: [{
    title: "Шкаф для одежды 1-дв. с зеркалом",
    sku: "OL-01-2",
    options: { Default: "Default" },
    prices: [{ amount: 8520000, currency_code: "rub" }],
  }],
}
```
