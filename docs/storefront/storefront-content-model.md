# Storefront Content Model

Минимальный content layer для Woodright storefront, основанный на аудите трёх источников.

---

## Content Entities

### 1. Collection

Коллекция мебели (= лист в workbook = набор предметов в едином стиле).

| Field | Purpose | Source of Truth | Final/Temporary | Required |
|-------|---------|----------------|-----------------|----------|
| `id` | Unique identifier | Generated | Final | Yes |
| `slug` | URL-safe identifier | Derived from name | Final | Yes |
| `name_ru` | Русское название | Workbook sheet name | Final | Yes |
| `name_en` | Английское название | Legacy site / PDF catalogs | Inferred | No |
| `description` | Описание коллекции | Legacy site / PDF catalog | Temporary | No |
| `hero_image` | Главное изображение | Yandex Disk PDF / legacy site | Temporary | No |
| `audience` | kids / adult / both | Manual mapping | Temporary | Yes |
| `material_options` | Доступные материалы | Workbook price columns | Final | Yes |
| `is_active` | Видимость в каталоге | Business decision | Final | Yes |

**Derived from workbook:** 8 коллекций

| Workbook | slug | name_en |
|----------|------|---------|
| ОЛИВЕР - ЧЕРНЫЙ | `oliver` | Oliver |
| ГРИНВИЧ | `greenwich` | Greenwich |
| ВВ | `willie-winkie` | Willie Winkie |
| ОКСФОРД | `oxford` | Oxford |
| ПРОВАНС | `provence` | Provence |
| ПРИНЦЕССА РОЗА | `princess-rose` | Princess Rose |
| КАНТРИ-ЛОНДОН-ПАРИЖ | `country-london-paris` | Country / London / Paris |
| МОНЧЕЛСИ | `monchelsea` | Monchelsea |

### 2. Category

Тип предмета мебели (= категория «Предметы» на legacy site).

| Field | Purpose | Source of Truth | Final/Temporary | Required |
|-------|---------|----------------|-----------------|----------|
| `id` | Unique identifier | Generated | Final | Yes |
| `slug` | URL-safe identifier | Derived from name | Final | Yes |
| `name_ru` | Русское название | Legacy site + workbook cross-ref | Final | Yes |
| `name_en` | Английское название | Derived | Temporary | No |
| `sort_order` | Порядок в навигации | Manual | Temporary | No |

**Candidate categories (из legacy site, верифицированные по workbook):**

| Category | slug | В workbook |
|----------|------|-----------|
| Банкетки и скамьи | `benches` | Да (Банкетка малая/большая) |
| Диваны | `sofas` | Да (Диван малый/большой) |
| Комоды | `dressers` | Да (Комод стандартный) |
| Кровати | `beds` | Да (Кровать 1-сп., 1.5-сп., 2-сп.) |
| Полки | `shelves` | Да (Полка книжная, навесная) |
| Стеллажи | `bookcases` | Да (Этажерка, шкаф книжный) |
| Столы и столики | `tables` | Да (Стол рабочий, обеденный) |
| Тумбы | `nightstands` | Да (Тумба прикроватная, ТВ) |
| Шкафы | `wardrobes` | Да (Шкаф 2-дв., 3-дв., угловой) |
| Зеркала | `mirrors` | Да (Зеркало навесное, напольное) |
| Детские кроватки | `cribs` | Частично (трансформеры в ПР) |
| Комплексы | `complexes` | Да (Оксфорд комплексы) |

> Категории «Кресла», «Стулья», «Прочее» из legacy site не имеют явного подтверждения в workbook — требуют ручной проверки.

### 3. Room

Тип комнаты (= room_type в RoomSet модели backend).

| Field | Purpose | Source of Truth | Final/Temporary | Required |
|-------|---------|----------------|-----------------|----------|
| `id` | Unique identifier | Generated | Final | Yes |
| `slug` | URL-safe identifier | Derived | Final | Yes |
| `name_ru` | Русское название | Legacy site | Final | Yes |
| `room_type` | Backend room_type value | Backend model | Final | Yes |

**Verified rooms (из legacy site):**

| Room | slug | room_type |
|------|------|-----------|
| Детские | `kids` | kids |
| Спальни | `bedroom` | bedroom |
| Гостиные | `living-room` | living_room |
| Кабинеты | `office` | office |

### 4. Product Card

Карточка товара для каталога и PDP.

| Field | Purpose | Source of Truth | Final/Temporary | Required |
|-------|---------|----------------|-----------------|----------|
| `id` | Unique identifier | Generated | Final | Yes |
| `article` | Артикул SKU | Workbook | Final | Yes |
| `name_ru` | Наименование | Workbook | Final | Yes |
| `collection_id` | Привязка к коллекции | Workbook (sheet) | Final | Yes |
| `category_id` | Привязка к категории | Inferred from name | Temporary | Yes |
| `product_type` | STANDARD / CONFIGURABLE | Business logic | Final | Yes |
| `variants` | Ценовые варианты | Workbook | Final | Yes |
| `dimensions` | Габариты ВхШхГ (мм) | Workbook | Final | No |
| `image_primary` | Главное фото | Legacy site / Yandex Disk | Temporary | No |
| `image_gallery` | Галерея фото | Legacy site / Yandex Disk | Temporary | No |
| `description` | Описание | Legacy site (if verified) | Temporary | No |

### 5. Variant (nested in Product)

Ценовой/материальный вариант товара.

| Field | Purpose | Source of Truth | Final/Temporary | Required |
|-------|---------|----------------|-----------------|----------|
| `sku` | Уникальный SKU | `{article}-{material_code}` | Final | Yes |
| `material` | Материал (массив/ЛДСП) | Workbook column header | Final | Yes |
| `finish` | Тон / роспись | Workbook column header | Final | No |
| `price` | Розничная цена (руб.) | Workbook | Final | Yes |
| `available` | Доступен ли вариант | price > 0 в workbook | Final | Yes |

### 6. Room Set (composition)

Готовая комната (уже в backend как RoomSet).

| Field | Purpose | Source of Truth | Final/Temporary | Required |
|-------|---------|----------------|-----------------|----------|
| `id` | Backend RoomSet ID | Backend | Final | Yes |
| `title` | Название | Business / legacy | Temporary | Yes |
| `slug` | URL slug | Derived | Final | Yes |
| `room_type` | Тип комнаты | Backend | Final | Yes |
| `collection_id` | Привязка к коллекции | Inferred | Temporary | No |
| `items` | Товары в комплекте | Backend RoomSetItem | Final | Yes |
| `hero_image` | Hero-фото комнаты | Yandex Disk / legacy | Temporary | Yes |
| `gallery` | Галерея интерьера | Yandex Disk / legacy | Temporary | No |
| `price_from` | Цена «от» | Calculated from items | Final | Yes |

### 7. Gallery / Interior Imagery

Интерьерные фотографии (не привязаны к конкретному товару).

| Field | Purpose | Source of Truth | Final/Temporary | Required |
|-------|---------|----------------|-----------------|----------|
| `id` | Unique identifier | Generated | Final | Yes |
| `file_path` | Путь к файлу | Yandex Disk / legacy | Temporary | Yes |
| `tags` | Теги (коллекция, комната) | Manual | Temporary | No |
| `usage` | hero / gallery / ambient | Manual | Temporary | No |

---

## Proposed File Structure

```
data/
├── raw/
│   ├── workbook/
│   │   └── parsed-sheets.json          # Raw parse of all 11 sheets
│   ├── legacy-site/
│   │   ├── categories.json             # Scraped category list
│   │   ├── collections.json            # Scraped collection list
│   │   └── products/                   # Scraped product pages (images + names)
│   │       ├── oliver/
│   │       ├── greenwich/
│   │       └── ...
│   └── yandex-disk/
│       ├── catalog-pdfs/               # Downloaded PDF catalogs
│       ├── front-images/               # Downloaded front photos
│       └── color-chart.xlsx            # Цвета по коллекциям
│
├── normalized/
│   ├── collections.json                # 8 collections with metadata
│   ├── categories.json                 # ~12 categories
│   ├── rooms.json                      # 4 room types
│   ├── products.json                   # ~335 products (excl. details/specorder)
│   ├── variants.json                   # All price variants
│   ├── accessories.json                # 8 accessories
│   ├── image-map.json                  # article → image file paths
│   ├── filters.json                    # Derived filter options
│   └── unresolved-matches.json         # Items needing manual review
│
└── README.md                           # Data pipeline documentation
```

### Why This Structure

- **`raw/`** — неизменённые данные из источников. Не редактируются вручную.
- **`normalized/`** — обработанные данные, готовые для seed script или storefront API.
- **Разделение по entity** позволяет инкрементальное обновление (обновить цены без перестройки images).
- **`unresolved-matches.json`** — явный audit trail для неразрешённых сопоставлений.

### What Goes Into Backend Seed vs Storefront

| Data | Destination | Mechanism |
|------|------------|-----------|
| Products, variants, prices | Backend (Medusa) | Seed script / Admin API |
| Categories | Backend (Medusa categories) | Seed script |
| Collections metadata | Storefront static data | JSON / constants |
| Room Sets | Backend (RoomSet model) | Seed script |
| Images | Static hosting / CDN | Upload pipeline |
| Filters | Derived from products | Storefront computed |

---

## Notes

1. **~335 основных товаров** (445 total - 68 деталей - 34 спецзаказа с multiplier ≈ 335 product cards)
2. **Детали** (68 шт.) — не отдельные product cards, а дополнительные элементы. В MVP можно не показывать в каталоге.
3. **Спецзаказ multiplier** (20+ шт.) — модификации, не отдельные товары. Маппятся на CONFIGURABLE product options.
4. **Спецзаказ absolute** (~10 шт.) — уникальные товары, можно добавить как CONFIGURABLE или BESPOKE.
5. **Willie Winkie — росписи** — по подтверждённым правилам каталога (`docs/storefront/catalog-interpretation-rules.md`) отдельные росписи не сводятся в один продукт с абстрактными color/finish-опциями: они моделируются как **отдельные подколлекции / отдельные обзорные уровни** (и при необходимости отдельные карточки), чтобы детский каталог не выглядел пустым. Технический контракт: `metadata.subcollection_label` и навигация по подколлекциям, а не «19 finish» одного SKU.
