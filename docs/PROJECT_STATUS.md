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

**Phase 1.** Status: functional + polished.

Implemented:

- Catalog page
- Product page
- Rooms and Room Sets pages
- Room Set buy flow
- Cart page
- Checkout flow
- Bespoke request flow
- SEO metadata

UX polish completed:

- UI state consistency
- Cart navigation improvements
- CTA feedback after add-to-cart
- Safe API error parsing
- Bespoke form UX polish
- Navigation after success states

Architecture constraints preserved:

- thin storefront
- backend as source of truth
- no global cart store
- no client-side business logic
- no BFF layer

## Known limitations (MVP)

- product_type filter выполняется in-memory
- category filter зависит от имени связи product-category в Medusa
- webhook payment не реализован
- CONFIGURABLE пока имеет один вариант (заглушка)

## Docs для AI

При больших задачах подключать контекст: **MASTER_PROMPT.md** — системный промпт; **AI_WORKING_RULES.md** — 10 правил, checklist, red flags; **SYSTEM_BOUNDARIES.md** — неизменяемые архитектурные границы; **CODEMAP.md** — карта проекта; **storefront-phase1.md** — State/CTA/Mutation contract.

## Запуск

- **Docker (рекомендуется):** `docker compose up --build` из корня. Подробно — **docs/MEDUSA_DOCKER_GUIDE.md**.
- **Порты:** storefront :8000, backend API :9000, admin :5173, postgres :5432, redis :6379.
- **Package manager:** Yarn 4 (`corepack enable` обязателен перед `yarn`).
- **После seed:** скопировать Publishable API Key из админки в `apps/storefront/.env.local` и `docker compose up -d --force-recreate storefront`.

## Next step

Полировка storefront Phase 1 (UI, фильтры каталога, отображение цен) или переход к Phase 2 (админка).
