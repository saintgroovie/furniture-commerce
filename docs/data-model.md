# Data Model

Источник: MASTER_PRD.md, архитектурный план.

---

## Medusa core (используем как есть + расширения)

- **Product** — расширен связью с **ProductClassification** (таблица `product_classification`, поле `product_type`: `STANDARD` | `CONFIGURABLE` | `BESPOKE`).
- **Product Variant, Product Option, Category** — без изменений структуры.
- **Cart, Line Item, Order, Customer** — без изменений. При необходимости — только metadata.

---

## Кастомные сущности

### RoomSet

Отдельная сущность (не коллекция Medusa).

- id, title, slug, description, hero_image, gallery (JSON или ссылки на медиа).
- price_from, room_type, style, is_active, timestamps.
- Связь с Product: many-to-many через **RoomSetItem** (room_set_id, product_id, quantity, sort_order).

### Lead

Контакт / источник заявки. Один человек или запрос может породить несколько заявок на расчёт.

- id, source (bespoke | room_adapt | contact), name, email, phone, comment, payload (JSON), status, created_at, updated_at.
- Связь: один Lead — много **BespokeRequest**.

### BespokeRequest

Конкретный запрос на расчёт. Привязан к Lead; у одного Lead может быть несколько BespokeRequest.

- id, lead_id (FK), product_id (nullable), room_set_id (nullable).
- Описание запроса: dimensions, materials, budget, comment (или JSON).
- status: новая | связались | расчёт отправлен | оплачено | в производстве | завершено.
- internal_notes, quoted_at, timestamps.

### PaymentLink

Бизнес-сущность оплаты по ссылке.

- id, entity_type (order | lead), entity_id. В MVP только order и lead; draft_order не используется.
- amount, currency_code, url, purpose, status (created | sent | paid | expired), expires_at, timestamps.

В MVP статус при необходимости обновляется вручную (webhook не обязателен).

---

## Связи

- **Product** ↔ **RoomSet**: many-to-many через RoomSetItem.
- **Lead** → **BespokeRequest**: one-to-many.
- **BespokeRequest** → Product, RoomSet: опционально.
- **PaymentLink** → Order или Lead (через entity_type + entity_id). В MVP только order и lead.
