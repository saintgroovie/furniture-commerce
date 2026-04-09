# Cross-Source Content Mapping Strategy

Стратегия сопоставления данных между тремя источниками для Woodright storefront.

---

## Matching Keys — Priority Order

### 1. Артикул / Код (primary key)

- Workbook артикул → legacy site product code (если доступен)
- Workbook артикул → Yandex Disk filename (если именуется по артикулу)
- **Format normalization required:** `GR-09-1` vs `09-1` vs `GR09-1`
- **Match confidence:** HIGH при точном совпадении

### 2. Exact Product Name

- Workbook НАИМЕНОВАНИЕ (RU) → legacy site product title
- Пример: workbook `Комод стандартный` → legacy `Комод стандартный`
- **Match confidence:** HIGH при точном совпадении, MEDIUM если отличается словоформа

### 3. Normalized Fuzzy Name Match

- Lowercase + trim + remove extra spaces + remove «для»/«с»/«без» prefixes
- Пример: `Шкаф для одежды 2-дв.` ↔ `Шкаф двухдверный`
- **Match confidence:** MEDIUM — требует ручного review
- **Rules:**
  - Числительные нормализуются: `2-дв.` = `двухдверный` = `2-дверный`
  - Размер матраса считается частью key: `(90*190)` ≠ `(120*190)`
  - Слова-модификаторы (`с тканью`, `без изножья`, `с рисунком`) — значимые, не удалять

### 4. Collection + Category + Approximate Name

- Workbook sheet name + тип предмета → legacy collection page + category
- Пример: Sheet `ПРОВАНС` + `Кровать 1-сп.` → `/provans/` + `/krovati/`
- **Match confidence:** LOW — возможны false positives
- **Use case:** Когда артикул и имя не матчатся, но категория + коллекция сужают scope

### 5. Manual Review Bucket

- Все записи, не прошедшие уровни 1-4, попадают в `unresolved-matches.json`
- Формат записи: `{ source, workbook_row, legacy_url, confidence, reason }`

---

## Matching Workbook → Legacy Website

### Algorithm

```
1. Parse workbook → extract {article, name, collection, dimensions, price}
2. For each workbook item:
   a. Search legacy site by article code
   b. If not found: search by exact name within same collection
   c. If not found: fuzzy match by normalized name
   d. If still not found: mark as "missing_on_legacy"
3. For matched items: extract {image_urls, legacy_description, legacy_price}
4. Flag price/dimension conflicts
```

### Expected Outcomes

| Result | Action |
|--------|--------|
| Exact match (article) | Auto-link, extract images |
| Name match | Auto-link with review flag |
| Fuzzy match | Manual review queue |
| No match | Mark as "workbook_only" — needs new photos |
| Legacy has item, workbook doesn't | Mark as "legacy_only" — possibly discontinued |

---

## Matching Workbook → Yandex Disk Assets

### Algorithm

```
1. Parse Yandex Disk folder structure → file inventory
2. For each workbook collection:
   a. Find corresponding PDF in /Каталоги/ (e.g., "Greenwich.pdf" → ГРИНВИЧ)
   b. Extract images from PDF (or flag for manual extraction)
3. For Front/ images:
   a. Match by internal code in filename (e.g., "f398" → ?)
   b. If code not recognizable → mark as "unmapped_asset"
4. For color swatches:
   a. Parse /Front/Цвета по коллекциям.xlsx for variant color references
```

### Collection ↔ PDF Mapping (verified)

| Workbook Sheet | Yandex Disk PDF |
|---------------|-----------------|
| ОЛИВЕР - ЧЕРНЫЙ | Oliver.pdf, Oliver-full.pdf, Oliver-oak.pdf |
| ГРИНВИЧ | Greenwich.pdf |
| ВВ | Willie Winkie.pdf + 19 painting PDFs |
| ОКСФОРД | Oxford.pdf, Oxford_full.pdf |
| ПРОВАНС | Provence White.pdf, Provence Dark.pdf |
| ПРИНЦЕССА РОЗА | Princess Rose.pdf |
| КАНТРИ-ЛОНДОН-ПАРИЖ | Country.pdf, London.pdf (Paris — отдельного PDF нет) |
| МОНЧЕЛСИ | Monchelsea.pdf |

---

## Data Status Markers

Каждый элемент данных помечается одним из статусов:

| Marker | Значение |
|--------|---------|
| `verified` | Данные подтверждены workbook (цена, размеры, артикул) |
| `inferred` | Данные выведены из secondary source (legacy site название, Yandex Disk фото) |
| `placeholder` | Временные данные, требуют замены (stock photo, примерное описание) |
| `conflict` | Расхождение между источниками (требует ручного resolution) |
| `missing` | Данные отсутствуют во всех источниках |

---

## Storage of Matches

### Verified matches

```json
{
  "article": "GR-09-1",
  "collection": "greenwich",
  "name_ru": "Зеркало навесное",
  "price_solid": 28400,
  "price_ldsp": null,
  "dimensions": { "h": 1000, "w": 650, "d": 30 },
  "status": "verified",
  "images": {
    "primary": { "source": "legacy", "url": "...", "status": "inferred" },
    "catalog_pdf": { "source": "yandex_disk", "file": "Greenwich.pdf", "page": null }
  }
}
```

### Unresolved matches

```json
{
  "article": "OL-XX-1",
  "name_workbook": "Стол обеденный",
  "candidates": [
    { "source": "legacy", "url": "/product/...", "confidence": 0.6, "name": "Стол обеденный раскладной" }
  ],
  "reason": "name_partial_match",
  "requires": "manual_review"
}
```

### Missing images

```json
{
  "article": "GR-05-1",
  "name": "Комод",
  "collection": "greenwich",
  "image_status": "missing",
  "checked_sources": ["legacy_site", "yandex_disk_front", "yandex_disk_pdf"]
}
```

### Conflicting data

```json
{
  "article": "PR-55-2",
  "field": "price",
  "workbook_value": 30700,
  "legacy_value": 28500,
  "resolution": "workbook_wins",
  "notes": "Legacy price likely outdated"
}
```

---

## Separation Principles

| Layer | Contents | Mutability |
|-------|----------|-----------|
| **Verified data** | Workbook prices, dimensions, articles | Immutable until new workbook |
| **Inferred data** | Legacy names, images, descriptions | Replaceable on review |
| **Temporary placeholders** | Missing images, draft descriptions | Must be replaced before launch |

---

## Practical Execution Steps

1. **Парсинг workbook** → `data/raw/workbook/products.json` (все листы)
2. **Scrape legacy site** → `data/raw/legacy-site/collections/`, `categories/`, `products/` (images + names)
3. **Download Yandex Disk** → `data/raw/yandex-disk/catalogs/`, `front/`, `content/`
4. **Run matching algorithm** → `data/normalized/products.json` + `data/normalized/unresolved-matches.json`
5. **Manual review** → resolve unresolved matches, confirm image assignments
6. **Generate final dataset** → ready for backend seed / storefront content
