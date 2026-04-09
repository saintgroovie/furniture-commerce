# Целевая модель отображения каталога

Целевое состояние витрины при соблюдении `docs/storefront/catalog-interpretation-rules.md`. Данные приходят с backend (Medusa); витрина только отображает поля и простую агрегацию на основе metadata.

---

## 1. Уровень коллекции

- Каждая активная коллекция имеет стабильный **slug** (`metadata.collection` на продуктах): `greenwich`, `willie-winkie`, `monchelsea`, `oliver-adult`, `oliver-kids` (после разделения данных).
- **Публичный label** — `metadata.collection_label` (или вывод из словаря по slug, если label единый для slug).
- Подколлекции (WW paintings и т.д.) — опционально `metadata.subcollection_label` + отдельные landing/фильтры навигации, когда появятся маршруты.

---

## 2. Уровень карточки (листинг)

Одна запись в сетке = один `DisplayEntry`:

- **Без группы:** один `product`, title = display name.
- **С группой:** представитель = первый по `display_group_sort`; title = `display_group_title` или fallback на title представителя; цена = минимум по членам; подсказка «N размеров».

Обязательные строки UI:

1. Коллекция (`collection_label`)
2. Display name (`h3`)
3. Артикул (первый variant SKU представителя или код из workbook в metadata — единый источник на уровне продукта)
4. Габариты (`metadata.dimensions`), если заданы
5. Цена (или «от …» для группы)

---

## 3. Уровень PDP

Секции сверху вниз:

1. Коллекция (label)
2. H1 — display name (`product.title`)
3. Опционально вторичная строка: `canonical_name`, если отличается от title или если title — укороченный display (Base / Cloud / Frame)
4. Артикул, габариты, цена
5. Галерея: thumbnail + все `images`, без дубликатов URL
6. Блок **«Другие размеры»** / соседи: продукты с тем же `metadata.display_group` и `metadata.collection`, отсортированные по `display_group_sort`
7. Блок **«Связанные варианты»** (банкетки/диваны): когда в данных появятся ссылки (`metadata.related_product_ids` или аналог) — не хардкодить по коллекции
8. Oliver: блок перекрёстной ссылки adult ↔ kids при наличии URL/handle в metadata

---

## 4. Поведение display group

- Ключ группы: `metadata.display_group` (строка, уникальна в паре с `metadata.collection`).
- Сортировка внутри группы: `display_group_sort` (ascending).
- В листинге один ряд на группу; на PDP пользователь выбирает конкретный размер (переход по ссылке на другой `product id`).

---

## 5. Связанные варианты (не размер)

- Отдельные карточки (малая/большая банкетка, диван).
- Связь задаётся явными полями metadata (список product id или handle), задаваемыми ingestion — витрина только рендерит ссылки.

---

## 6. Имена Base / Cloud / Frame

- `product.title` = короткий display name для H1 и карточки.
- `metadata.canonical_name` = полное / workbook имя для подзаголовка PDP при необходимости.
- Не склеивать в одну строку вида «Кровать Base Greenwich» без структуры; предпочтительно: строка коллекции + отдельно display name.

---

## 7. Соответствие архитектуре

- Без нового BFF; без дублирования правил корзины и типов товаров.
- Расширение контракта — через **metadata продукта** и существующий `GET /store/products` / `GET /store/products/:id`.
