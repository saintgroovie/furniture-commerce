# AI Change Log

Журнал архитектурных решений и изменений проекта Woodright.

Этот файл используется AI (Cursor) и разработчиками для понимания,
почему были приняты определённые решения.

Не заменяет git log.
Фиксирует только важные архитектурные изменения.

---

# Текущее состояние

Backend Phase 1 завершён.

Реализовано:

- Medusa backend
- ProductType extension
- RoomSet + RoomSetItem
- Lead
- BespokeRequest
- PaymentLink
- Cart protection для BESPOKE
- Store API
- Admin API
- Seed

Storefront Phase 1:

- архитектура зафиксирована
- создан skeleton apps/storefront
- API clients реализованы
- cart session реализована (cookie cart_id, ensureCart, add/remove)
- checkout Phase 1 реализован (форма email/адрес, updateCart, completeCart, success, очистка session)

Git tag:

v0.1-backend-foundation

---

# Архитектурные решения

## Backend — источник истины

Все бизнес-правила находятся в backend.

Storefront не должен:

- дублировать бизнес-логику
- принимать решения по типам товаров
- валидировать корзину

---

## Типы товаров

ProductType:

STANDARD  
CONFIGURABLE  
BESPOKE

Правила:

STANDARD → можно в cart  
CONFIGURABLE → cart + bespoke request  
BESPOKE → только bespoke request

---

## Room Sets

RoomSet — отдельная сущность.

Это не:

- категория
- коллекция
- bundle

RoomSet представляет готовый интерьерный комплект.

---

## Bespoke flow

Lead — контакт клиента.

BespokeRequest — конкретный запрос на расчёт.

Связь:

Lead → много BespokeRequest

---

## Payment links

PaymentLink используется для оплаты после подтверждения заказа.

В MVP:

entity_type:

- order
- lead

Webhook оплаты пока не используется.

---

## Cart стратегия (Phase 1)

Cart state должен быть максимально простым.

Storefront хранит только:

cart_id

Backend является источником истины.

После любых изменений корзины выполняется повторный запрос данных.

Не использовать:

- сложный global cart store
- optimistic updates

---

# Как обновлять AI_CHANGELOG

Добавлять записи только при:

- изменении архитектуры
- добавлении новых сущностей
- изменении бизнес-правил
- изменении структуры проекта

Не записывать мелкие изменения кода.

---

## SEO и metadata (storefront Phase 1)

Базовая SEO-инфраструктура: layout — metadataBase (getSiteUrl), default title/description, title.template «%s | Woodright», openGraph (siteName, locale), Organization JSON-LD. Статическая metadata для главной, каталога, комнат, корзины, checkout (cart/checkout — robots noindex, nofollow). generateMetadata для product и room set (getProduct, getRoomSetBySlug), canonical, openGraph; при 404/ошибке — нейтральные meta. Product JSON-LD на странице товара; ItemList JSON-LD на /catalog при success. Хелпер getSiteUrl() в lib/api/base.ts, NEXT_PUBLIC_SITE_URL в .env.example. Вся metadata и JSON-LD — server-side; без нового backend API. Docs: storefront-phase1 (раздел 8), PROJECT_STATUS.

---

## Cart navigation UX (storefront Phase 1)

ProductCta и RoomSetCta: при success после добавления в корзину показывается ссылка «В корзину» на `/cart` (только в success-state). CartSummary: в состояниях empty и invalid_state добавлены ссылки «В комнаты» и «На главную» рядом с «В каталог». Header без изменений (статичная ссылка на корзину). Docs: storefront-phase1, PROJECT_STATUS.

---

## UI state polish (catalog, rooms, product CTA)

getProducts: безопасный разбор ошибки — чтение body один раз (text), попытка JSON.parse и извлечение message, иначе текст ответа или fallback. Catalog и rooms: в error state добавлен тот же h1, что в empty/success («Каталог» / «Комнаты»). ProductCta: при STANDARD/CONFIGURABLE без variantId показывается текст «Нет варианта для заказа» вместо пустой области CTA. Docs: storefront-phase1 (уточнение error/cta fallback), PROJECT_STATUS.

---

## RoomSet buy flow (storefront Phase 1) — полировка

Backend: GET /store/room-sets/:slug расширен — в items подгружаются product.productType.* и product.variants.* для корректного UX (фильтр BESPOKE, variant_id). Storefront: RoomSetCta — cart-eligible items считаются до ensureCart; при 0 eligible (пустой комплект или все BESPOKE) корзина не создаётся, показывается сообщение; success только при добавлении хотя бы одного item; при ошибке в цикле — сообщение «Проверьте корзину и повторите попытку», без rollback.

---

## Checkout Phase 1 (storefront) — полировка

Полировка checkout: (1) completeCart — безопасный разбор ошибки: тело ответа читается один раз через res.text(), затем JSON.parse с fallback на текст или «Ошибка оформления заказа»; (2) корзина существует, но пуста (0 items) → показ empty_cart и очистка session вместо invalid_cart_state; invalid_cart_state только при 404/недоступная корзина. Docs: storefront-phase1 уточнён (empty_cart / invalid_cart_state).

---

## Checkout Phase 1 (storefront)

Оформление заказа без оплаты на сайте: storefront вызывает Medusa store API updateCart (email, shipping_address) и completeCart; при успехе (type === "order") очищается cart_id в cookie и показывается success. Состояния: empty_cart, loading, ready, submitting, success, validation_error, server_error, invalid_cart_state. Бизнес-логика не дублируется на frontend. Доработка: на странице checkout добавлены order summary (состав корзины из getCart), защита от двойной отправки (useRef), data-state для всех состояний; invalid_cart_state при CART_NOT_FOUND с очисткой session.

---

## UI state contracts и CTA rules (storefront Phase 1)

Зафиксированы консистентные state contracts для всех страниц: catalog (loading, success, empty, error), product (loading, success, not_found, error; CTA cta_pending/cta_success/cta_error), rooms (loading, success, empty, error), room set (loading, success, not_found, error; CTA те же), bespoke (idle, submitting, success, error_validation, error_server), cart (loading, empty, ready, mutating, error), checkout (все по контракту). CTA contract: STANDARD — только add to cart; CONFIGURABLE — add to cart + request quote; BESPOKE — только request quote; Room set — buy set + adapt. Ошибки 404 (not_found) и серверные ошибки (error) разведены; empty не подменяет error. API helpers getProduct и getRoomSetBySlug при 404 бросают Error(NOT_FOUND) для различения на страницах.

---

## AI foundation завершён

Создан **MASTER_PROMPT.md** — системный промпт для Cursor: архитектурный контекст, сущности, product rules, cart архитектура, storefront/mutation rules, запрещённые изменения, workflow до и после изменений. В **AI_WORKING_RULES.md** добавлена ссылка на MASTER_PROMPT. В **storefront-phase1.md** — ссылка на MASTER_PROMPT. В **PROJECT_STATUS.md** секция «Docs для AI» расширена (MASTER_PROMPT, AI_WORKING_RULES, CODEMAP, storefront-phase1). State Contract, CTA Contract, Mutation Contract зафиксированы в storefront-phase1.md; дублирование в MASTER_PROMPT не вводится, только ссылка на storefront-phase1.

---

## AI Working Rules (docs)

Создан **AI_WORKING_RULES.md**: короткий операционный документ для Cursor/AI. Десять правил (не переносить бизнес-логику во frontend; backend — источник истины; не дублировать cart state; без optimistic updates; не вводить новые слои; не подменять RoomSet; не обходить Medusa без необходимости; обновлять docs; предпочитать простые расширения; сверяться с docs перед изменениями). Секции Pre-change checklist и Red flags. Ссылки на документ добавлены в PROJECT_STATUS.md и CODEMAP.md.

---

## Storefront Phase 1 State Contract (формализация)

В storefront-phase1.md добавлены: **Core Rules** (frontend рендерит состояния и вызывает API; backend владеет правилами; cart UI не предсказывает итог; CTA — только отображение по данным backend), **Mutation Contract** (action → pending → API → refetch → render / error feedback), **Запрещено** (не вычислять доменные ограничения, не дублировать cart state, не подменять error/not_found). Полный **State Contract** по страницам с правилами (loading → skeleton, empty/error — фиксированные сообщения). **CTA Contract** вынесен отдельно. Реализация: скелетоны при loading (catalog grid, rooms grid, product/room-set/checkout/cart блоки), сообщения «Товары не найдены», «Комплекты не найдены», «Не удалось загрузить…», «Товар не найден», «Комплект не найден». Cart/checkout: при 404 getCart — CART_NOT_FOUND, состояние invalid_state, очистка session, сообщение «Корзина недоступна» / «Корзина повреждена или недоступна».

---

## SYSTEM_BOUNDARIES (docs)

Создан **SYSTEM_BOUNDARIES.md**: документ неизменяемых архитектурных границ. Десять границ: (1) системная архитектура — single backend, thin storefront, REST; запрет BFF, GraphQL, микросервисов; (2) домен — сущности и запрет подмены RoomSet category/collection/product; (3) бизнес-логика — только backend; (4) корзина — без копии на frontend, без optimistic updates, без global store; (5) поведение товара — ProductType, backend источник истины; (6) API — только REST, без прямого доступа к БД; (7) расширение — только modules, links, middleware; (8) сложность — без enterprise-слоёв; (9) документация — обновление docs при изменении архитектуры; (10) эскалация — при касании границ: остановиться, проверить docs, предложить решение, обновить документацию, затем менять код. Ссылки на документ добавлены в PROJECT_STATUS.md и CODEMAP.md.

---
