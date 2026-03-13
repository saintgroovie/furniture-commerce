# Woodright Project Status

## Backend

Phase 1 completed.

Реализовано:

- Medusa backend
- ProductType extension
- RoomSet + RoomSetItem
- Lead
- BespokeRequest
- PaymentLink
- Cart protection for BESPOKE
- Store API
- Admin API
- Seed

Backend соответствует:

- data-model.md
- api.md
- product-rules.md
- admin-flows.md

Git tag:

v0.1-backend-foundation

## Storefront

Phase 1 в работе.

Реализовано:

- Skeleton, API clients (products, room-sets, leads, bespoke-requests, cart, checkout).
- Cart session (cookie cart_id, ensureCart, add/remove, CartSummary).
- Страницы: главная, catalog, product/[id], rooms, rooms/[slug], bespoke, cart, checkout.
- Checkout Phase 1: форма (email, адрес), order summary (состав корзины), updateCart + completeCart, все состояния по State Contract (loading, empty_cart, ready, submitting, success, error_validation, error_server, invalid_cart_state), очистка cart_id после успеха, защита от двойной отправки.
- Storefront Phase 1 State Contract зафиксирован в storefront-phase1.md (Core Rules, Mutation Contract, Запрещено, полный State Contract и CTA Contract).
- UI state polish: getProducts — безопасный разбор ошибки (body один раз, message из JSON, fallback); catalog/rooms — h1 в error state; ProductCta — fallback «Нет варианта для заказа» при отсутствии variant.
- RoomSet buy flow: payload GET /store/room-sets/:slug с productType и variants; edge cases — пустой комплект / все BESPOKE (сообщение, без создания корзины), success только при ≥1 item, частичный сбой без rollback.
- Консистентные UI состояния: catalog/rooms — skeleton при loading, empty/error с фиксированными сообщениями; product/room set — not_found vs error, skeleton; cart — loading skeleton, empty, ready, mutating, error, invalid_state (404 → очистка session); checkout — invalid_cart_state при CART_NOT_FOUND, skeleton при loading. CTA по product_type (backend authoritative).

## Known limitations (MVP)

- product_type filter выполняется in-memory
- category filter зависит от имени связи product-category в Medusa
- webhook payment не реализован
- CONFIGURABLE пока имеет один вариант (заглушка)

## Docs для AI

При больших задачах подключать контекст: **MASTER_PROMPT.md** — системный промпт; **AI_WORKING_RULES.md** — 10 правил, checklist, red flags; **SYSTEM_BOUNDARIES.md** — неизменяемые архитектурные границы; **CODEMAP.md** — карта проекта; **storefront-phase1.md** — State/CTA/Mutation contract.

## Next step

Полировка storefront Phase 1 (UI, фильтры каталога, отображение цен) или переход к Phase 2 (админка).
