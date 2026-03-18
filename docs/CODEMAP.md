# Карта кода проекта

## Назначение проекта

- **Woodright** — мебельный ecommerce + bespoke.
- Стек: **Medusa backend**, **Next.js storefront**, **PostgreSQL**.
- Гибрид: каталог, покупка через корзину и заявки на расчёт (bespoke).

---

## Верхнеуровневая структура репозитория

- **docs/** — документация проекта (источник истины для архитектуры и правил).
- **apps/backend/** — Medusa backend (REST API, бизнес-логика, БД).
- **apps/storefront/** — Next.js storefront (тонкий клиент к backend).

---

## docs/

Назначение основных файлов:

| Файл | Назначение |
|------|------------|
| **MASTER_PRD.md** | Главный PRD: видение, типы товаров, каталог, Room Sets, checkout, bespoke, MVP. |
| **architecture.md** | Высокоуровневая архитектура: Medusa, Next.js, PostgreSQL, потоки данных. |
| **data-model.md** | Модель данных: Product (расширение), RoomSet, Lead, BespokeRequest, PaymentLink, связи. |
| **api.md** | REST API: каталог, корзина, Room Sets, заявки, Payment Link. |
| **mvp-scope.md** | Границы MVP: что в scope и вне scope. |
| **phases.md** | Этапы разработки (Phase 0–6) и Definition of Done. |
| **product-rules.md** | Правила типов товаров (STANDARD / CONFIGURABLE / BESPOKE), корзина, Room Set. |
| **admin-flows.md** | Поведение админки: Room Sets, Leads, Bespoke Requests, Payment Links. |
| **storefront-phase1.md** | Архитектура storefront Phase 1: страницы, API, компоненты, CTA, DoD. |
| **development-rules.md** | Обязательные правила разработки (документация, модули, не менять core). |
| **architecture-guardrails.md** | Архитектурные ограничения (без BFF, без микросервисов, storefront без бизнес-логики). |
| **PROJECT_STATUS.md** | Текущее состояние: backend Phase 1, storefront, ограничения MVP, следующий шаг. |
| **MASTER_PROMPT.md** | Системный промпт для Cursor: контекст, сущности, product/cart/storefront rules, workflow до и после изменений. |
| **AI_WORKING_RULES.md** | Правила работы AI: 10 инвариантов, pre-change checklist, red flags. Подключать в больших задачах. |
| **SYSTEM_BOUNDARIES.md** | Неизменяемые границы системы: архитектура, домен, логика, cart, product, API, расширение, сложность, docs, эскалация. |
| **CODEMAP.md** | Карта кода для AI: структура, модули, сущности, правила, точки осторожности. |
| **MEDUSA_DOCKER_GUIDE.md** | Medusa v2 в Docker: Yarn 4, volume/node_modules, env (два URL для storefront), CORS, Admin/Vite, чеклист запуска, частые ошибки. |

---

## apps/backend/

- Это **Medusa backend** (один инстанс). Единственный источник истины для бизнес-логики и данных.

**Структура и ответственность:**

- **src/modules/** — кастомные модули: product-extension (ProductClassification), room-set, lead, bespoke-request, payment-link. Модели, сервисы, индекс каждого модуля.
- **src/api/store/** — store API: products, product/[id], room-sets, room-sets/[slug], leads, bespoke-requests.
- **src/api/admin/** — admin API: room-sets, room-sets/[id], leads, leads/[id], bespoke-requests, bespoke-requests/[id], payment-links, payment-links/[id].
- **src/api/middlewares.ts** — middleware: защита корзины (BESPOKE не допускается в line-items).
- **src/links/** — связи между сущностями: Product ↔ ProductClassification, Product ↔ RoomSetItem.
- **src/scripts/seed.ts** — сид: регион РФ, категории, продукты с типами, Room Sets с товарами.

Backend не форкается; расширение только через модули, links и middleware.

---

## apps/storefront/

- Это **тонкий клиент** к backend REST API. Без BFF, без GraphQL. Не содержит бизнес-логики корзины и типов товаров.

**Структура и ответственность:**

- **src/app/** — маршруты Next.js App Router: layout, главная, catalog, product/[id], rooms, rooms/[slug], bespoke, cart, checkout.
- **src/components/** — UI-компоненты: product-card, product-cta, room-set-card, room-set-cta, bespoke-form, cart-summary.
- **src/lib/api/** — вызовы backend: products, room-sets, leads, bespoke-requests, cart, checkout, base (URL).
- **src/lib/cart/session.ts** — сессия корзины: чтение/запись cart_id в cookie, ensureCart (создание корзины через backend при отсутствии).

Storefront только отображает данные и вызывает API; правила (например, кто идёт в корзину) определяет backend.

---

## Ключевые бизнес-сущности

- **Product** — товар Medusa; тип задаётся связью с ProductClassification.
- **ProductClassification** — тип товара: STANDARD | CONFIGURABLE | BESPOKE (связь 1:1 с Product). Таблица `product_classification`, поле `product_type`.
- **RoomSet** — готовая комната (отдельная сущность): title, slug, описание, price_from, room_type, style, is_active.
- **RoomSetItem** — позиция в Room Set: связь с Product, quantity, sort_order.
- **Lead** — контакт/источник заявки (source, name, email, phone, comment); один Lead — много BespokeRequest.
- **BespokeRequest** — заявка на расчёт: lead_id, опционально product_id/room_set_id, dimensions, materials, budget, comment, status.
- **PaymentLink** — ссылка на оплату: entity_type (order | lead), entity_id, amount, url, status; в MVP только order и lead.

---

## Ключевые правила

- **BESPOKE** никогда не добавляется в корзину; проверка на backend (middleware), при нарушении — 4xx.
- **RoomSet** — отдельная сущность, не category и не collection Medusa.
- **Lead** и **BespokeRequest** разделены: Lead — контакт, BespokeRequest — конкретный запрос на расчёт.
- **PaymentLink** в MVP только для entity_type **lead** и **order** (не draft_order).
- **Backend** — источник истины по бизнес-логике; при расхождении править код, а не документацию без согласования.
- **Storefront** не дублирует backend-правила (типы товаров, валидация корзины); только отображение и вызов API.

---

## Точки осторожности

- Не форкать и не править **Medusa core**; расширять только модулями, links, middleware.
- Не добавлять **BFF** и дополнительные backend-приложения.
- Не выносить бизнес-логику (правила типов товаров, корзины, заявок) во **frontend**.
- Не генерировать **комбинации вариантов** автоматически; варианты создаются явно.
- Не усложнять **cart state** в Phase 1 (без глобального store, без optimistic updates).
- Не менять архитектуру без **сначала обновления docs** (architecture, data-model, api и т.д.).

---

# Как использовать CODEMAP

- **Перед изменениями** читать CODEMAP.md, чтобы понимать структуру и ответственность модулей.
- Сверяться с **development-rules.md** (правила разработки, модули, core).
- Сверяться с **architecture-guardrails.md** (ограничения архитектуры).
- Сверяться с **MASTER_PRD.md** при добавлении функций и сценариев.
- Если изменение затрагивает архитектуру или контракты — **сначала обновлять docs**, затем код.
