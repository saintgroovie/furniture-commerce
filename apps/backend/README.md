# Furniture Backend (Medusa v2)

Backend для мебельного ecommerce + bespoke. Источник требований: `/docs/project/MASTER_PRD.md`, `/docs/architecture/architecture.md`, `/docs/architecture/data-model.md`.

## Стек

- Medusa v2
- PostgreSQL

## Настройка

1. Скопировать `.env.example` в `.env` и задать `DATABASE_URL`, `JWT_SECRET`.
2. Установить зависимости: `npm install`.
3. Сгенерировать миграции для кастомных модулей и применить их:

```bash
# Генерация миграций по одному модулю (ProductType, RoomSet, RoomSetItem, Lead, BespokeRequest, PaymentLink)
npx medusa db:generate productExtensionModuleService
npx medusa db:generate roomSetModuleService
npx medusa db:generate leadModuleService
npx medusa db:generate bespokeRequestModuleService
npx medusa db:generate paymentLinkModuleService

# Применить миграции
npx medusa db:migrate

# Синхронизировать link-таблицы (Product ↔ ProductType, Product ↔ RoomSetItem)
npx medusa db:sync-links
```

4. Запуск: `npm run dev` (разработка) или `npm run start` (production).

5. Seed (опционально): `npx medusa exec ./src/scripts/seed.ts` — регион РФ/RUB, категории, продукты с product_type, Room Sets. Требует предварительно применённых миграций и при необходимости дефолтный shipping profile / sales channel в БД.

## Кастомные модули

- **product-extension** — поле `product_type` (STANDARD / CONFIGURABLE / BESPOKE), связь 1:1 с Product через link.
- **room-set** — RoomSet и RoomSetItem; связь RoomSetItem ↔ Product через link (удобно подгружать продукты в Room Set).
- **lead** — Lead (контакт/источник заявки).
- **bespoke-request** — BespokeRequest (запрос на расчёт), явные поля: dimensions, materials, budget, comment, status.
- **payment-link** — PaymentLink (ручной режим в MVP, без webhook).

## API (по /docs/architecture/api.md)

**Store:**  
`GET /store/products` (query: product_type, category_id), `GET /store/room-sets`, `GET /store/room-sets/:slug`, `POST /store/leads`, `POST /store/bespoke-requests`.

**Admin:**  
`GET/POST /admin/room-sets`, `GET/PATCH/DELETE /admin/room-sets/:id`, `GET /admin/leads`, `GET /admin/leads/:id`, `GET /admin/bespoke-requests` (query: status), `GET/PATCH /admin/bespoke-requests/:id`, `GET/POST /admin/payment-links`, `GET/PATCH /admin/payment-links/:id`.

## Проверка корзины (BESPOKE)

Middleware на `POST /store/carts/:id/line-items`: перед стандартным add-to-cart проверяется `product_type` по link Product ↔ ProductType. Если тип BESPOKE — ответ 400, иначе запрос передаётся в стандартный flow Medusa.

## Документация

- Архитектура и модель данных: `/docs/architecture/architecture.md`, `/docs/architecture/data-model.md`.
- API и продуктовые правила: `/docs/architecture/api.md`, `/docs/guidelines/product-rules.md`.
- MVP и этапы: `/docs/project/mvp-scope.md`, `/docs/project/phases.md`.
