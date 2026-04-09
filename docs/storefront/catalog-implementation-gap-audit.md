# Аудит реализации каталога относительно правил интерпретации

Дата: 2026-04-10. Кодовая база: `furniture-commerce` (Medusa + Next.js storefront).

---

## 1. Что уже соответствует

| Область | Состояние |
|---------|-----------|
| **Greenwich ingestion → metadata** | В `scripts/seed-greenwich.ts`: `collection`, `collection_label`, `dimensions`, `display_group*`, цены из workbook. |
| **Display groups (кровати по размеру)** | `groupProductsForDisplay` читает `metadata.display_group`, показывает общий title и «от N ₽». |
| **Тонкий storefront** | Цены и типы приходят с API; группировка опирается на поля из backend metadata. |
| **Исключение BESPOKE из основного каталога** | `/catalog` фильтрует `BESPOKE`. |
| **Детский контент через Room Sets** | `resolveKidsProducts()` определяет kids-only товары по составу room sets — не дублирует бизнес-правило вручную по коллекциям. |

---

## 2. Выявленные расхождения

### 2.1 Карточка товара и display group

**Правило:** коллекция, название, артикул, габариты, цена.

**Было:** при наличии `displayGroup` артикул и габариты **не показывались** (`product-card.tsx` условие `!displayGroup`), хотя коллекция оставалась в контекстной строке.

**Риск:** карточка группы кроватей нарушала обязательный набор полей.

---

### 2.2 PDP

**Правило:** галерея, соседи по размеру, canonical/workbook name при необходимости.

**Было:**

- Одно главное изображение; остальные из `images` не выводились.
- Нет блока «другие размеры» для членов одной `display_group`.
- `canonical_name` из ingestion не попадал в metadata при использовании актуального сида в `apps/backend/src/scripts/seed-greenwich.ts` (устаревшая копия без части полей).

---

### 2.3 Активные коллекции

**Правило:** не выводить в каталог паузируемые коллекции (Princess Rose, Country/London/Paris и т.д.), когда у товара явно задан slug коллекции в metadata.

**Было:** `/catalog` показывал все опубликованные товары кроме kids/BESPOKE; товары с будущим `metadata.collection` вне активного набора не отфильтровывались.

**Примечание:** демо-товары из `seed.ts` без `metadata.collection` остаются видимыми для локальной разработки.

---

### 2.4 Oliver: взрослый / детский

**Правило:** две ветки каталога + перекрёстные ссылки.

**Было:** в данных и сидах нет разделения `oliver-adult` / `oliver-kids`, нет полей для перекрёстных ссылок. Реализация не начата — требуется ingestion + seed + UI-поля.

---

### 2.5 Willie Winkie: картины

**Правило:** подколлекции, не generic variants.

**Было:** в `docs/storefront/storefront-content-model.md` до сих пор указано моделировать росписи WW как variant finish — **противоречит** подтверждённым правилам. В коде витрины отдельной навигации по подколлекциям WW нет; в ingestion нет стабильного `subcollection_label` для всех позиций.

---

### 2.6 Документация vs код

- `storefront-content-model.md` (раздел про WW painting variants) устарел относительно `catalog-interpretation-rules.md`.
- `apps/backend/src/scripts/seed-greenwich.ts` расходился с `scripts/seed-greenwich.ts` (нет `collection_label`, `display_group*`).

---

## 3. Краткая матрица по коллекциям

| Коллекция | Моделирование в backend | Карточка / PDP vs правила |
|-----------|-------------------------|---------------------------|
| Greenwich | Pilot ingestion + seed | После правок: карточка + группы + PDP ближе к правилам |
| Oliver | Нет split в данных | Не выполнено |
| Willie Winkie | Нет подколлекций в API | Не выполнено |
| Monchelsea | В entity mapping, не в активном сиде витрины | Зависит от появления продуктов с metadata |

---

## 4. Вывод

Критичные быстрые исправления: карточка с группой, PDP (галерея + соседи по `display_group`), фильтр активных коллекций, синхронизация seed и `canonical_name`.  
Структурные темы (Oliver, WW подколлекции) зафиксированы как **нерешённые без данных и согласования контента**.
