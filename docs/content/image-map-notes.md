# Image Map Notes

Документация для `data/normalized/image-map-skeleton.json` и `image-map.schema.json`.

---

## Назначение

Image map связывает каждый товар из workbook с визуальными ассетами из трёх источников:
legacy site, Yandex Disk, manual uploads. Это промежуточный слой между raw данными и
финальным seed/content pipeline.

---

## Schema

Файл `data/normalized/image-map.schema.json` определяет JSON Schema для image-map.

### Ключевые поля

| Поле | Тип | Описание |
|------|-----|---------|
| `workbook_row_key` | string | `{collection}:{code}` — unique key |
| `product_code_normalized` | string\|null | Артикул из workbook |
| `collection_name_normalized` | string | Collection slug |
| `canonical_name` | string | Наименование из workbook |
| `main_image` | object\|null | Primary product photo |
| `gallery_images` | array | Additional angles |
| `interior_images` | array | Product in room context |
| `mapping_status` | enum | verified / fuzzy / missing / blocked |
| `confidence` | number | 0.0 – 1.0 |
| `review_notes` | string\|null | Issues requiring attention |

### Image Object

Каждый image (main, gallery, interior) содержит:

```json
{
  "source_type": "legacy_site",
  "source_ref": "https://woodright.ru/...",
  "local_path": null,
  "is_verified": false,
  "confidence": 0.6
}
```

---

## Current State: Skeleton

`image-map-skeleton.json` содержит **342 entries** — по одному на каждый product
из основных коллекций и аксессуаров (детали и спецзаказ исключены).

Все entries сейчас имеют:
- `main_image: null`
- `gallery_images: []`
- `mapping_status: "missing"` или `"blocked"`
- `confidence: 0.0`

Это **skeleton** — заполнение images произойдёт после scrape/download этапа.

---

## Mapping Status Flow

```
blocked ──→ missing ──→ fuzzy ──→ verified
   ↑           ↑          ↑          │
   │           │          │          │ (final state)
   │           │          └── manual review confirms
   │           └── image found but no code match
   └── needs business decision (VV tiers, missing code)
```

### Status Details

| Status | Meaning | Count in Skeleton | Next Action |
|--------|---------|-------------------|-------------|
| `missing` | No image linked yet | 279 | Scrape/download assets |
| `blocked` | Cannot proceed without decision | 63 | Business review (VV tiers: 59, missing code: 4) |
| `fuzzy` | Image found, match uncertain | 0 (none yet) | Manual confirmation |
| `verified` | Exact match confirmed | 0 (none yet) | Ready for use |

---

## Population Pipeline

### Phase 1: Download assets (not yet done)
1. Scrape legacy site collection pages → extract product image URLs
2. Download Yandex Disk PDF catalogs → extract page images
3. Download Front folder JPGs

### Phase 2: Auto-matching
1. Match legacy product images to workbook by article code → `verified`
2. Match by product name within same collection → `fuzzy`
3. Match PDF catalog pages to collections → `catalog_page` assets

### Phase 3: Manual review
1. Resolve `fuzzy` matches → promote to `verified` or demote to `missing`
2. Resolve `blocked` entries → VV painting decision, missing codes
3. Assign unmapped Front folder images

### Phase 4: Finalization
1. All `verified` images → ready for seed/CDN upload
2. Remaining `missing` → placeholder images or manual photography

---

## Rules for Image Assignment

1. **Never assign interior shot as main_image** — main must show isolated product
2. **Never mix VV painting images** — each painting variant needs separate images
3. **Legacy site images are `inferred`** until manually verified
4. **PDF-extracted images are `inferred`** — quality may be lower than original
5. **One product = one main_image** — no multiple main images
6. **Interior images shared** — one interior shot can reference multiple products
7. **Confidence thresholds:**
   - 0.0 = no match
   - 0.3 = collection match only
   - 0.6 = name match (fuzzy)
   - 0.8 = article code match from URL
   - 1.0 = manually verified

---

## Safety

- This file does NOT modify backend or storefront code
- Image map is consumed by future seed scripts, not by current app
- Schema is informational — no runtime validation against it yet
- All images start as `inferred`; nothing is `final` without human review
