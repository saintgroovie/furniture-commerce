# AI Handoff Context

Этот документ — snapshot текущего состояния проекта для переноса контекста в новый чат.
Последнее обновление: 2026-03-18.

---

## Проект

**Woodright** — мебельный ecommerce + bespoke (индивидуальные проекты).

Стек: Medusa v2 backend + Next.js storefront + PostgreSQL.
Гибрид: каталог с корзиной + заявки на индивидуальный расчёт.
Рынок: РФ.

---

## Репозиторий

- Repo: `saintgroovie/furniture-commerce` (GitHub, private)
- Monorepo: `apps/backend/` + `apps/storefront/`
- Текущая ветка: `storefront/phase1-foundation-and-polish`
- PR #1 открыт, base = `main`
- Working tree: clean (все изменения закоммичены и запушены)
- `gh` CLI доступен по пути `~/bin/gh`

---

## Обязательные правила

Перед любыми изменениями читай:
1. `docs/guidelines/development-rules.md` — правила разработки
2. `docs/architecture/architecture-guardrails.md` — архитектурные ограничения
3. `docs/project/CODEMAP.md` — карта кода

Ключевые ограничения:
- Backend = единственный source of truth для business logic
- Storefront = thin client, без business logic
- Не форкать Medusa core
- Расширение backend только через modules / links / middleware
- Не добавлять BFF, microservices, GraphQL
- Не выходить за MVP scope (`docs/project/mvp-scope.md`)

---

## Cursor Rules (`.cursor/rules/`)

| Файл | Назначение |
|------|-----------|
| `language-preference.mdc` | Пиши по-русски, код на английском |
| `kids-content-separation.mdc` | Kids = navigation/content layer, не purchase axis. Source of truth — `lib/kids.ts` |
| `github-access.mdc` | `gh` в `~/bin/gh`. После каждого пуша обновлять/создавать PR |

---

## Архитектура: две оси, которые нельзя смешивать

### Purchase/business axis (backend)
- `ProductClassification.product_type`: STANDARD / CONFIGURABLE / BESPOKE
- STANDARD → корзина
- CONFIGURABLE → корзина + заявка на расчёт
- BESPOKE → только заявка, **никогда** не в корзину
- Проверка на backend: middleware блокирует add-to-cart для BESPOKE (4xx)

### Navigation/content axis (storefront)
- Main catalog (`/catalog`) — только STANDARD + CONFIGURABLE
- Kids section (`/kids/**`) — kids-only products по room_type
- Bespoke section (`/bespoke/**`) — BESPOKE products + request form
- Cart и checkout — shared, не дублируются

---

## Backend (Phase 1 — done)

### Кастомные модули (`apps/backend/src/modules/`)
- `product-extension` — ProductClassification (product_type enum)
- `room-set` — RoomSet + RoomSetItem
- `lead` — Lead (контакт клиента)
- `bespoke-request` — BespokeRequest (заявка на расчёт)
- `payment-link` — PaymentLink (ссылка на оплату)

### API
- Store: `/store/products`, `/store/products/[id]`, `/store/room-sets`, `/store/room-sets/[slug]`, `/store/leads`, `/store/bespoke-requests`
- Admin: CRUD для room-sets, leads, bespoke-requests, payment-links
- Middleware: cart protection (BESPOKE → 4xx)

### Links
- Product ↔ ProductClassification (1:1)
- Product ↔ RoomSetItem

---

## Storefront (Phase 1 — done)

### Route map

```
/                           — главная (hero + CTA)
/catalog                    — каталог (STANDARD + CONFIGURABLE, без BESPOKE, без kids-only)
/product/[id]               — карточка товара (все типы, CTA по типу)
/rooms                      — все room sets
/rooms/[slug]               — room set detail
/cart                       — корзина (shared, группировка kids/adult)
/checkout                   — checkout (shared)
/kids                       — kids landing (hero)
/kids/catalog               — kids-only products
/kids/rooms                 — kids room sets
/bespoke                    — bespoke landing (hero)
/bespoke/catalog            — BESPOKE-only products
/bespoke/request            — форма заявки на расчёт
```

### Layouts
- `app/layout.tsx` — root layout, header nav, footer
- `app/kids/layout.tsx` — nested kids layout, `.kids-theme`, sub-nav
- `app/bespoke/layout.tsx` — nested bespoke layout, `.bespoke-theme`, sub-nav

### Components (`src/components/`)
- `product-card.tsx` — карточка товара (badge "На заказ" для BESPOKE)
- `product-cta.tsx` — CTA по типу: add-to-cart / "Получить расчёт" / "Сделать по моим размерам"
- `room-set-card.tsx` — карточка room set
- `room-set-cta.tsx` — CTA room set
- `bespoke-form.tsx` — форма заявки (Lead + BespokeRequest через API)
- `cart-summary.tsx` — корзина с группировкой kids/adult
- `checkout-form.tsx` — checkout

### Lib (`src/lib/`)
- `api/base.ts` — base URL, medusaFetch (publishable API key)
- `api/products.ts`, `api/room-sets.ts`, `api/cart.ts`, `api/leads.ts`, `api/bespoke-requests.ts`, `api/checkout.ts`
- `cart/session.ts` — cart_id в cookie, ensureCart
- `format.ts` — formatRub, getPrice
- `kids.ts` — `KIDS_ROOM_TYPE`, `resolveKidsProducts()` (content-layer filter по room_type)
- `bespoke.ts` — `BESPOKE_PRODUCT_TYPE`, `resolveBespokeProducts()` (content-layer filter по product_type)

### Catalog UX (current state)
- Filter tabs: "Все", "Готовые" (STANDARD), "С выбором исполнения" (CONFIGURABLE)
- BESPOKE не в filter tabs
- BESPOKE products исключены из grid
- Navigation CTA "Индивидуальный проект →" ведёт на `/bespoke`
- Kids-only products исключены из grid

---

## Что сделано (полная история ветки)

```
0272d32 feat(storefront): add publishable API key support, cart/room-sets clients, and missing component files
b7bd564 style(storefront): Phase 1 UI/UX polish — layout, catalog filters, pricing, accessibility
d2678a4 fix(backend+storefront): resolve product_classification entity alias, seed, and storefront field mapping
f8f7a01 fix(room-set): sync room_set_item snapshot with model and migration
ed342cd fix(cart): resolve add-to-cart failure — add variant prices, stock location, and inventory setup
c19c19d docs: align entity naming ProductType → ProductClassification after self-audit
35a82c3 docs: add default-CONFIGURABLE rule, axis separation, fix remaining ProductType refs
5fa93b4 style(storefront): replace inline styles with CSS classes and improve form labels
a4816a9 feat(storefront): add kids and bespoke content sub-sites, refine catalog UX
```

---

## Deliberate temporary states

1. **Product detail вне subsites:** `/product/[id]` — общий route для всех типов. BESPOKE detail не под `/bespoke/product/[id]`. Это осознанное решение для MVP.
2. **Client-side filtering:** `resolveBespokeProducts()` и `resolveKidsProducts()` загружают все продукты и фильтруют. При росте каталога потребуется backend endpoint с фильтрами.
3. **product_type filter — client-side:** Medusa store API не поддерживает query по кастомным полям.
4. **Один вариант у CONFIGURABLE:** заглушка для MVP.

---

## Запуск

```bash
docker compose up --build          # из корня
# Порты: storefront :8000, backend :9000, admin :5173, postgres :5432, redis :6379
# После seed: скопировать Publishable API Key из админки в apps/storefront/.env.local
```

Package manager: Yarn 4 (`corepack enable` перед `yarn`).

---

## Документация (`docs/`)

| Путь | Когда читать |
|------|-------------|
| `docs/project/MASTER_PRD.md` | Требования, бизнес-логика, product vision |
| `docs/project/CODEMAP.md` | Карта кода — перед изменениями |
| `docs/guidelines/development-rules.md` | Правила разработки — перед изменениями |
| `docs/architecture/architecture-guardrails.md` | Архитектурные ограничения — перед изменениями |
| `docs/architecture/data-model.md` | Модель данных |
| `docs/architecture/api.md` | REST API контракт |
| `docs/guidelines/product-rules.md` | Правила типов товаров |
| `docs/architecture/SYSTEM_BOUNDARIES.md` | Неизменяемые границы |
| `docs/project/MASTER_PROMPT.md` | Системный промпт с контекстом |
| `docs/storefront/storefront-phase1.md` | Storefront Phase 1 spec |
| `docs/project/PROJECT_STATUS.md` | Текущий статус |

---

## Следующие шаги (не начаты)

- Phase 2: админка (Room Sets, Leads, Bespoke Requests, Payment Links UI в Medusa admin)
- SEO: structured data для bespoke catalog, sitemap
- Performance: server-side filtering по product_type (backend endpoint)
- UX: bespoke product detail под `/bespoke/product/[id]`
- Production: webhook payment, мультивариантные CONFIGURABLE товары
