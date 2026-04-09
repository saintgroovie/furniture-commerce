# Manual Review Queues

Документация для `data/normalized/unresolved-image-matches.json`.

---

## Overview

Файл содержит 8 очередей неразрешённых случаев, которые требуют ручного
решения перед тем, как images можно будет привязать к товарам.

---

## Queue Breakdown

### 1. `missing_product_code` (4 items)

Товары из workbook без артикула. Невозможно создать stable key для маппинга.

| Sheet | Row | Name |
|-------|-----|------|
| МОНЧЕЛСИ | 31 | Кровать 2-сп. (160×200) с выс.сп. С жест. Филенкой |
| МОНЧЕЛСИ | 32 | Кровать 2-сп. (160×200) с выс.сп. С мяг. Филенкой |
| МОНЧЕЛСИ | 76 | Этажерка большая 6-полок |
| МОНЧЕЛСИ | 77 | Этажерка малая 3-полоки |

**Действие:** Уточнить артикулы у бизнеса. Без артикула нельзя надёжно привязать фото.

---

### 2. `ambiguous_name_match` (0 items — queue пуста)

Будет заполнена после scrape legacy site, когда fuzzy name matching найдёт
неоднозначные совпадения.

---

### 3. `collection_conflict` (0 items — queue пуста)

Случаи, когда один asset претендует на принадлежность к разным коллекциям.
Может появиться после PDF extraction.

---

### 4. `room_only_image` (4 items)

Изображения комнат с legacy site, которые не привязаны к конкретному товару.

| Room Type | Source |
|-----------|--------|
| kids | `/komnaty/detskie/` |
| bedroom | `/komnaty/spalni/` |
| living_room | `/komnaty/gostinye/` |
| office | `/komnaty/kabinety/` |

**Действие:** После scrape — извлечь room shots. Использовать как `interior` images для room sets, не для product cards.

---

### 5. `legacy_only_image` (1 item)

Контент, присутствующий на legacy site, но отсутствующий в workbook.

- **Tudor Oak** (`/tudor-oak-ru/`) — коллекция есть на сайте, но нет в розничном прайсе. Возможно снята с производства.

**Действие:** Уточнить у бизнеса статус Tudor Oak. Не использовать в storefront без подтверждения.

---

### 6. `disk_only_image` (14 items)

Файлы из Yandex Disk `/Front/`, которые не маппятся на workbook-артикулы.

Файлы с opaque кодами: `f398.jpg`, `g396.jpg`, `h356.jpg`, `h393.jpg`, `j453.jpg`, `k427.jpg`, `m477.jpg`, `s444.jpg`, `G503-pvw.jpg`, `L386.jpg`, `R765-pvs.jpg`, `R765-mn-big.jpg`, `f405.jpg`, `f464.jpg`.

**Действие:** Скачать файлы, визуально определить какой товар/коллекция на фото. Создать manual mapping table.

---

### 7. `vv_variant_decision_blocked` (59 items)

Все товары коллекции ВВ (Willie Winkie). Каждый физический предмет существует
в 19+ вариантах росписи. Пока не принято бизнес-решение о том, как моделировать
росписи в storefront, нельзя привязывать images.

**Варианты решения:**
- **A)** Каждая роспись = отдельный product → нужно 59×19 = 1121 image assignments
- **B)** Каждая роспись = variant/finish → нужно 59 main images + 19 finish swatches
- **C)** Показывать одну «базовую» роспись → нужно 59 main images

**Действие:** Бизнес-решение о модели VV painting в storefront. Это blocking dependency для 59 товаров.

---

### 8. `needs_business_review` (3 items)

Аксессуары с parse warnings, требующие проверки.

| Code | Name |
|------|------|
| A-51-3 | Валик декоративный |
| A-50-1 | Подушка декоративная (400×400) |
| A-50-2 | Подушка декоративная (500×500) |

**Действие:** Подтвердить, что эти аксессуары нужны в storefront. Найти или сфотографировать.

---

## Priority of Resolution

| Priority | Queue | Impact | Effort |
|----------|-------|--------|--------|
| 1 | `vv_variant_decision_blocked` | 59 products (~17% каталога) | Business decision |
| 2 | `missing_product_code` | 4 products | Quick data fix |
| 3 | `disk_only_image` | 14 potential product images | Manual visual review |
| 4 | `room_only_image` | Room set imagery | Scrape + review |
| 5 | `legacy_only_image` | 1 collection (Tudor Oak) | Business check |
| 6 | `needs_business_review` | 3 accessories | Quick check |

---

## Workbook-to-Asset Matching Rules

### Priority 1: Exact Article/Code Match
- Workbook `product_code_normalized` (e.g., `GR-09-1`) matches against:
  - Legacy site URL containing article code
  - Filename containing article code
- **Confidence:** 1.0
- **Status:** `verified`

### Priority 2: Exact Canonical Product Name
- Workbook `product_name_raw` exact match against legacy site product title
- Within same collection only
- **Confidence:** 0.8
- **Status:** `fuzzy` → needs confirmation

### Priority 3: Normalized Name Match Within Collection
- Lowercase, trim, normalize numerals (`2-дв.` = `двухдверный`)
- Must be within same collection
- **Confidence:** 0.6
- **Status:** `fuzzy`

### Priority 4: PDF Catalog Page / Manual Review
- Product visually identified on PDF catalog page
- Collection match is implicit (PDF per collection)
- **Confidence:** 0.5
- **Status:** `fuzzy`

### Priority 5: Unresolved Bucket
- No match at any level → `missing`
- **Confidence:** 0.0

### Special Cases

**Products without article (Мончелси 4 items):**
- Cannot use Priority 1 or 2 reliably
- Use Priority 3 (name match) with extra caution
- Key is `monchelsea:row_XX` instead of `monchelsea:MN-XX-X`

**VV painting tiers:**
- All 59 VV items have article codes, but images are painting-specific
- Same physical product (e.g., `WW-55-1 Банкетка малая`) has 19 visual variants
- Cannot assign one image — blocked until painting model decision

**Zero-price ЛДСП rows:**
- No impact on image mapping — image is same regardless of material
- ЛДСП variant does not need separate image

**Room/interior imagery without single-product mapping:**
- Room shots from legacy site → `interior_images` on multiple products
- Never use as `main_image`
- Link to room_set if applicable, or tag by collection
