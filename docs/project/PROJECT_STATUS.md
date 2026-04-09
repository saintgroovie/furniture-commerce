# Woodright Project Status

## Backend

Phase 1 completed.

Реализовано:

- Medusa backend
- ProductClassification extension (таблица `product_classification`)
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

**Phase 1.** Status: functional + UI polish Phases A-D completed.

Implemented:

- Catalog page
- Product page
- Rooms and Room Sets pages
- Room Set buy flow
- Cart page
- Checkout flow
- Bespoke request flow
- Room set → bespoke: CTA «Адаптировать под мою комнату» → `/bespoke/request?room_set_id=...` (исправлена потеря `room_set_id` через лендинг `/bespoke?...`). Заявка с `room_set_id`, lead `source=room_adapt`; backend без изменений; docs приведены в соответствие.
- SEO metadata

UX polish completed:

- UI state consistency
- Cart navigation improvements
- CTA feedback after add-to-cart
- Safe API error parsing
- Bespoke form UX polish
- Navigation after success states

UI refactor completed (Phases A-D):

- Phase A: warm palette tokens, Inter font, spacing scale, typography foundation
- Phase B: product card cleanup (clickable, description removed, badge labels, 4:5 image), room-set-card cleanup (clickable, 16:9 image, description removed)
- Phase C: PDP grid 3fr/2fr + 4:5 image, room-set detail hero image + product links, badge labels
- Phase D: cart/checkout/bespoke inline styles → CSS, checkout section headings, bespoke intro + CTA copy, .service-page layout
- Shared utilities: lib/format.ts (formatRub, getPrice)
- `<Image>` migration deferred — image domains unconfirmed

Architecture constraints preserved:

- thin storefront
- backend as source of truth
- no global cart store
- no client-side business logic
- no BFF layer

## Known limitations (MVP)

- product_type filter выполняется client-side (storefront); server-side фильтрация снята из-за ограничений Medusa store API query params
- category filter зависит от имени связи product-category в Medusa
- webhook payment не реализован
- CONFIGURABLE пока имеет один вариант (заглушка)

## Self-audit log

- `f8f7a01` — fix: room_set_item snapshot содержал product_id, которого нет в модели и миграции. Удалён из snapshot. Предотвращает некорректные future migrations.
- `ed342cd` — cleanup: rename ProductType → ProductClassification в модели, сервисе, комментариях, файле. Чисто технический rename для соответствия Medusa v2 naming.

## Docs для AI

При больших задачах подключать контекст: **MASTER_PROMPT.md** — системный промпт; **AI_WORKING_RULES.md** — 10 правил, checklist, red flags; **SYSTEM_BOUNDARIES.md** — неизменяемые архитектурные границы; **CODEMAP.md** — карта проекта; **storefront-phase1.md** — State/CTA/Mutation contract.

## Запуск

- **Docker (рекомендуется):** `docker compose up --build` из корня. Подробно — **docs/MEDUSA_DOCKER_GUIDE.md**.
- **Порты:** storefront :8000, backend API :9000, admin :5173, postgres :5432, redis :6379.
- **Package manager:** Yarn 4 (`corepack enable` обязателен перед `yarn`).
- **После seed:** скопировать Publishable API Key из админки в `apps/storefront/.env.local` и `docker compose up -d --force-recreate storefront`.

## Next step

Phase E (content-driven final pass): homepage sections, PDP gallery, editorial room-set cards — requires real content/images. Or: `<Image>` migration (requires confirming image domains), mobile hamburger menu, Phase 2 (admin).
