# Naming System — публичные labels storefront

Source of truth для user-facing labels в Woodright storefront.  
Все новые страницы, компоненты и навигационные элементы должны использовать canonical labels из этого документа.

---

## Навигация

| Элемент | Canonical label | Куда ведёт |
|---------|----------------|------------|
| Main catalog | Каталог | `/catalog` |
| Rooms | Комнаты | `/rooms` |
| Kids section | Детская | `/kids` |
| Bespoke section | По проекту | `/bespoke` |
| About section | О бренде | `/about` |
| Designers section | Дизайнерам | `/designers/terms` |
| Contacts | Контакты | `/contacts` |
| Cart | Корзина | `/cart` |

---

## Dropdown items

### Каталог
- Все → `/catalog`
- Готовые → `/catalog?product_type=STANDARD`
- С выбором исполнения → `/catalog?product_type=CONFIGURABLE`

BESPOKE не входит в dropdown Каталог.

### Детская
- Каталог → `/kids/catalog`
- Комнаты → `/kids/rooms`
- О разделе → `/kids`

### По проекту
- Как это работает → `/bespoke`
- Направления → `/bespoke/catalog`
- Оставить заявку → `/bespoke/request`

### О бренде
- О компании → `/about`
- Производство → `/about/production`
- Материалы → `/about/materials`

### Дизайнерам
- Условия сотрудничества → `/designers/terms`
- Материалы → `/designers/materials`
- Оставить заявку → `/designers/request`

---

## Типы товаров — filter labels

| product_type | Filter tab label | Badge label |
|-------------|-----------------|-------------|
| STANDARD | Готовые | — |
| CONFIGURABLE | С выбором исполнения | — |
| BESPOKE | — (не в filter tabs) | На заказ |

«На заказ» используется только как product badge — характеристика товара.  
Как section name или nav label «На заказ» не используется.

---

## Section headings

| Раздел | Canonical heading |
|--------|-------------------|
| Homepage hero | Мебель на заказ |
| Bespoke landing / catalog | Мебель по проекту |
| Kids landing / catalog | Мебель для детской |
| Rooms listing | Комнаты |
| Cart | Корзина |

«Мебель на заказ» — brand-level proposition (вся мебель Woodright).  
«Мебель по проекту» — section-level heading (bespoke direction).  
Это два разных контекста, не взаимозаменяемые.

---

## Action CTAs

| Контекст | CTA label |
|----------|-----------|
| BESPOKE product | Получить расчёт |
| CONFIGURABLE product (secondary) | Сделать по моим размерам |
| STANDARD / CONFIGURABLE product | Добавить в корзину |
| Room set (buy) | Купить комплект |
| Room set (adapt) | Адаптировать под мою комнату |
| Bespoke request form | Заявка на расчёт |
| General submit | Оставить заявку |
| Catalog → bespoke direction | По проекту → |

CTA-формулировки могут быть action-oriented и отличаться от section labels.  
Это допустимо, если они не конфликтуют по смыслу с canonical section name.

---

## Cross-entry blocks

| Откуда | Куда | Heading | CTA |
|--------|------|---------|-----|
| /rooms | /kids/rooms | Детские комнаты | В раздел детской → |
| /catalog | /bespoke | — | По проекту → |

---

## Cart grouping

| Группа | Label |
|--------|-------|
| Main products | Woodright |
| Kids products | Woodright Kids |

---

## Legacy labels — не использовать как primary public labels

| Legacy label | Почему нельзя | Замена |
|-------------|---------------|--------|
| На заказ (как section name) | Заменён на «По проекту» | По проекту |
| Индивидуальный проект | Был CTA, не стал canonical | По проекту → |
| Настраиваемые | Был filter label, не consumer-friendly | С выбором исполнения |

«На заказ» допустим только как product badge для BESPOKE товаров.

---

## Метаданные коллекции (`metadata.collection` / `metadata.collection_label`)

Согласованные подписи для данных в Medusa (карточка товара, группировки).  
Менять только через утверждённые ingestion / backfill шаги.

| `metadata.collection` | `metadata.collection_label` |
|------------------------|-------------------------------|
| `oliver` | Oliver |
| `oliver-kids` | Oliver Kids |

---

## Правила применения

1. Новые nav items должны использовать labels из таблицы «Навигация».
2. Filter labels для product_type берутся из таблицы «Типы товаров».
3. Section headings берутся из таблицы «Section headings».
4. Если нужен новый label, добавить его сюда перед использованием.
5. Legacy labels не появляются в новом коде как primary navigation или section labels.
