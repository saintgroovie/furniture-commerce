# Woodright order / payment / fulfillment architecture audit

**Worktree (read-only):** `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725`  
**Branch tip (observed):** `feat/sales-modes-order-lifecycle-20260725` @ `081da6e` (merge base from PR #91)  
**Audit date:** 2026-07-25  
**Scope:** Medusa order / payment / fulfillment contracts as implemented in this worktree (code + docs), not live DB state.

---

## 1. Medusa packages and versions

### Direct dependencies (`apps/backend/package.json`)

| Package | Declared | Resolved in `apps/backend/yarn.lock` |
|---|---|---|
| `@medusajs/admin-sdk` | `2.17.2` (exact) | `2.17.2` |
| `@medusajs/framework` | `^2.17.2` | `2.17.2` |
| `@medusajs/medusa` | `^2.17.2` | `2.17.2` |
| `@medusajs/cli` (dev) | `^2.17.2` | `2.17.2` |

**Effective Medusa version: `2.17.2`.**

### Relevant transitive Medusa modules (same lockfile, all `2.17.2`)

| Package | Role for this audit |
|---|---|
| `@medusajs/order` | Core Order module (used as-is; no Woodright fork) |
| `@medusajs/cart` | Core cart / complete-cart |
| `@medusajs/payment` | Core payment collections / sessions |
| `@medusajs/payment-stripe` | Present in lockfile via Medusa; **not configured** in `medusa-config.ts` |
| `@medusajs/fulfillment` | Core fulfillment module |
| `@medusajs/fulfillment-manual` | Manual fulfillment provider package (transitive); **no custom provider code** in repo |
| `@medusajs/core-flows` | Used for cart line-item override (`addToCartWorkflow`) |
| `@medusajs/draft-order` | Present in lockfile; product docs say draft_order is **not** used in MVP |

`apps/backend/yarn.lock` is present and pins the Medusa graph to **2.17.2**.

`medusa-config.ts` registers **only** custom Woodright modules (`product-extension`, `room-set`, `lead`, `bespoke-request`, `payment-link`). No payment/fulfillment provider module blocks are declared - Medusa defaults apply.

---

## 2. Current order model usage

### Core Medusa Order

- Product canon (`docs/data-model.md`): **Cart, Line Item, Order, Customer - without structural changes**; metadata only "if needed".
- **No custom Order module**, no order metadata schema, no order extension model under `apps/backend/src/modules`.
- **No** `src/workflows/**` and **no** `src/subscribers/**` related to orders (directories absent).
- Storefront creates orders via standard Medusa Store API: `POST /store/carts/:id/complete` after preparing shipping + payment session (`apps/storefront/src/lib/api/checkout.ts`).
- On success (`type === "order"`), storefront shows order display number and clears cart session - no post-order Woodright workflow.

### Custom modules that touch the *sales lifecycle* (not Order entity)

| Module | Path | Purpose vs orders |
|---|---|---|
| `payment-link` | `apps/backend/src/modules/payment-link` | Soft-links to Medusa `order` **or** `lead` via `entity_type` + `entity_id` (no FK / no Module Link) |
| `bespoke-request` | `apps/backend/src/modules/bespoke-request` | Quote / production CRM track; separate from Medusa Order |
| `lead` | `apps/backend/src/modules/lead` | Contact intake; may receive PaymentLinks |
| `product-extension` | `apps/backend/src/modules/product-extension` | `ProductClassification` (`STANDARD` / `CONFIGURABLE` / `BESPOKE`) gates cart eligibility |
| `room-set` | `apps/backend/src/modules/room-set` | Catalog/bundle entity; not order lifecycle |

### Order metadata

- **No** backend writes to `order.metadata` found in custom API / modules / seed.
- Docs allow metadata "при необходимости"; **not implemented** for lifecycle states in this worktree.

### Workflows / subscribers

| Kind | Present? |
|---|---|
| Custom order workflows | **No** |
| Order-created / payment / fulfillment subscribers | **No** |
| Webhooks for PaymentLink paid | **No** (explicit MVP: manual status) |

---

## 3. Payment model

### A. Checkout-time payment (Medusa core, no real capture)

Storefront `prepareCheckoutForCompletion`:

1. Ensures a shipping method exists (`GET /store/shipping-options?cart_id=…`, then `POST …/shipping-methods`).
2. Creates payment collection if missing (`POST /store/payment-collections`).
3. Opens a payment session with **`provider_id: "pp_system_default"`** (built-in no-op / system provider).
4. Completes cart (`POST /store/carts/:id/complete`).

Intent (docs + checkout comments): **no online payment on site in MVP**; system provider only satisfies Medusa completion prerequisites.

**Gap:** error copy references `npm run ensure-checkout-ready`, but **no such script** exists in backend/root `package.json` in this worktree.

### B. Business payment: `PaymentLink` custom module

Model (`payment_link`):

| Field | Type / notes |
|---|---|
| `id` | PK |
| `entity_type` | enum `order` \| `lead` |
| `entity_id` | text (loose reference; not a Medusa link) |
| `amount` | number |
| `currency_code` | text |
| `url` | text (operator-supplied; backend does **not** generate PSP URLs) |
| `purpose` | nullable text |
| `status` | enum `created` \| `sent` \| `paid` \| `expired` (default `created`) |
| `expires_at` | nullable datetime |

Service: thin `MedusaService({ PaymentLink })` - CRUD only, no PSP integration, no webhook handlers.

Admin API:

- `GET/POST /admin/payment-links`
- `GET/PATCH /admin/payment-links/:id` (PATCH: `status`, `url`)

Store API: **none** for payment links (admin-only).

### C. Payment providers configuration

- `medusa-config.ts`: **no** `Modules.PAYMENT` / Stripe / custom provider registration.
- `@medusajs/payment-stripe` is a lockfile transitive dependency only.
- Observed runtime provider ID used by storefront: **`pp_system_default`** only.

### D. Payment status usage in APIs

| Surface | Status field | Values / usage |
|---|---|---|
| PaymentLink | `status` | `created` / `sent` / `paid` / `expired` - manual PATCH |
| BespokeRequest | `status` includes `paid` | Mixed lifecycle enum (see §6) |
| Lead | `status` | free-form nullable `text` - unused as payment SoT |
| Medusa Order | core payment status | Via default Medusa Admin / Store order APIs only; **no custom Woodright mapping** |

---

## 4. Fulfillment model

| Question | Finding |
|---|---|
| Custom fulfillment providers in repo? | **None** |
| Shipment tracking fields on custom models? | **None** |
| Status mapping manufacturing → fulfillment? | **None** on Order; only BespokeRequest `in_production` / `completed` |
| Configured fulfillment module in `medusa-config.ts`? | **No** - Medusa defaults (`@medusajs/fulfillment` + `@medusajs/fulfillment-manual` via framework) |
| Storefront shipping | Picks **first** available shipping option; no carrier / tracking UX |

Implication for sales-order lifecycle work: **fulfillment is Medusa-default / unspecified for Woodright**, while "production" currently lives on **BespokeRequest**, not Order fulfillment.

---

## 5. Store / Admin order APIs under `apps/backend/src/api/`

### Custom routes present (no `/orders` trees)

**Store (`apps/backend/src/api/store/`):**

| Route tree | Role |
|---|---|
| `products/`, `catalog-products/` | Catalog projections |
| `room-sets/` | Room set read APIs |
| `leads/` | Create lead |
| `bespoke-requests/` | Create bespoke request |
| `carts/[id]/line-items/` | **Override** add-to-cart (configured pricing) |
| `motif-*` | Motif theme context |
| `_lib/public-mutation-rate-limit.ts` | Rate limit for public POSTs |

**Admin (`apps/backend/src/api/admin/`):**

| Route tree | Role |
|---|---|
| `room-sets/` | CRUD room sets |
| `leads/` | List / retrieve leads |
| `bespoke-requests/` | List / retrieve / PATCH status notes |
| `payment-links/` | List / create / retrieve / PATCH payment links |

### Order APIs

- **No** `apps/backend/src/api/store/**/orders/**`
- **No** `apps/backend/src/api/admin/**/orders/**`
- Orders are expected via **stock Medusa** Store/Admin endpoints (complete cart → order; Admin Orders UI).

Cart guard middleware (not an order route): `POST /store/carts/:id/line-items` → `ensureNotBespokeForCart` in `middlewares.ts`.

---

## 6. Status fields that mix manufacturing / payment / fulfillment

### Explicit mixed enum: `BespokeRequest.status`

```
new → contacted → quote_sent → paid → in_production → completed
```

This **single** field conflates:

| Stage type | Values |
|---|---|
| CRM / sales | `new`, `contacted`, `quote_sent` |
| Payment | `paid` |
| Manufacturing | `in_production` |
| Terminal | `completed` |

There is **no** separate payment_status / production_status / fulfillment_status on BespokeRequest.

### Separate but parallel payment status: `PaymentLink.status`

`created | sent | paid | expired` - payment-only, but **not wired** to BespokeRequest or Order (no sync job / subscriber). An order can be "complete" in Medusa while PaymentLink is still `created`; a BespokeRequest can be marked `paid` without a PaymentLink row.

### Lead.status

Nullable free-text - not an enum; potential third informal status channel.

### Medusa Order statuses

Untouched by Woodright code. Core Medusa order / payment / fulfillment statuses remain the platform defaults and are **orthogonal** to BespokeRequest / PaymentLink enums - risk of **three parallel status stories** (Order vs PaymentLink vs BespokeRequest) with no orchestration.

### ProductClassification (not order status)

`STANDARD | CONFIGURABLE | BESPOKE` - commerce mode / CTA / cart eligibility, not lifecycle.

---

## 7. BESPOKE / ProductClassification / cart middleware

### Classification model

- Entity name: `product_classification` (`ProductClassification`)
- Field: `product_type` enum `STANDARD | CONFIGURABLE | BESPOKE`
- Link: Product 1:1 ProductClassification (`src/links/product-product-extension.ts`)
- Graph field used by guard: `product_classification.product_type`
- Contract doc: `docs/backend/SCHEMA_COMPATIBILITY_CONTRACT.md` (do not bind to core Medusa `product_type` table)

### Cart gate (fail-closed)

1. Middleware matcher: `POST /store/carts/:id/line-items` (`middlewares.ts`).
2. Pure evaluator: `evaluateCartClassificationGate` (`cart-classification-gate.ts`).
3. Rules:
   - missing product / missing / non-string classification → **500** `PRODUCT_TYPE_VALIDATION_FAILED`
   - `BESPOKE` → **400** `BESPOKE_NOT_ALLOWED_IN_CART`
   - otherwise allow → core / override handler continues
4. Line-items route override still runs **after** middleware; comment documents that BESPOKE guard remains authoritative.
5. Kids metadata must **not** bypass (per schema contract).

### BESPOKE sales path (not cart/order)

Storefront form → `POST /store/leads` → `POST /store/bespoke-requests` → Admin manages status → Admin may create `PaymentLink` for `entity_type: lead` (or later `order`).

Docs: BESPOKE → request_quote only; never cart.

---

## 8. Migrations pattern for custom modules

### Documented / scripted pattern

From `apps/backend/README.md` + `package.json` scripts:

```bash
# Generate per module service key
npx medusa db:generate productExtensionModuleService
npx medusa db:generate roomSetModuleService
npx medusa db:generate leadModuleService
npx medusa db:generate bespokeRequestModuleService
npx medusa db:generate paymentLinkModuleService

npx medusa db:migrate
npx medusa db:sync-links
```

Yarn aliases:

- `yarn db:generate` → `medusa db:generate`
- `yarn db:migrate` → `medusa db:migrate`
- `yarn db:sync-links` → `medusa db:sync-links`

Deploy helper: `apps/backend/scripts/migrate-only.sh` runs `./node_modules/.bin/medusa db:migrate` (migrations only, no seed).

Module registration keys (must match `db:generate` names):

| Module dir | Export const | Service key |
|---|---|---|
| product-extension | `PRODUCT_EXTENSION_MODULE` | `productExtensionModuleService` |
| room-set | (room set module) | `roomSetModuleService` |
| lead | `LEAD_MODULE` | `leadModuleService` |
| bespoke-request | `BESPOKE_REQUEST_MODULE` | `bespokeRequestModuleService` |
| payment-link | `PAYMENT_LINK_MODULE` | `paymentLinkModuleService` |

### Migrations in this worktree

- **No** `**/migrations/**` files currently tracked by git (`git ls-files '**/migrations/**'` → count **0**).
- Module folders contain only `index.ts`, `service.ts`, `models/` (no `migrations/` directories on disk).
- Historical commits mention migrations (e.g. product_classification rename, room_set_item), but **generated migration SQL is not present in the current tree**.
- Schema-compat contract explicitly says some classification work is **code-only against existing live DB** ("No migration / DDL / DML is required for this contract") - separate from greenfield `db:generate` flow.

**Implication:** greenfield DB still expects operators to **generate** migrations locally; shared/live DB may already have tables from prior environments. Lifecycle work that adds models must follow `db:generate <ModuleServiceKey>` + commit migrations if the project decides to vendor them again.

### Timestamp rule

Custom models must **not** use `.default(() => new Date())` on `created_at` / `updated_at`; handlers set `updated_at: new Date()` on PATCH when needed.

---

## 9. End-to-end lifecycle picture (as-is)

```text
STANDARD / CONFIGURABLE
  Storefront cart
    → middleware classification gate
    → (optional) configured unit price override
    → prepareCheckout (shipping + pp_system_default session)
    → completeCart → Medusa Order
    → (offline) Admin creates PaymentLink(entity_type=order)
    → manual PaymentLink.status → paid
    → Medusa fulfillment: unspecified / default Admin only

BESPOKE
  Storefront form → Lead + BespokeRequest
    → Admin CRM status (mixed enum)
    → PaymentLink(entity_type=lead) optional
    → never Medusa cart / order (blocked)
```

**Missing for a unified sales-order lifecycle:** order-side manufacturing status, payment↔order sync, fulfillment/tracking, subscribers, and any separation of payment vs production vs shipment states on Order.

---

## 10. Key file paths (1-line purpose)

### Config / packages

| Path | Purpose |
|---|---|
| `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725/apps/backend/package.json` | Backend scripts + direct Medusa 2.17.2 deps |
| `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725/apps/backend/yarn.lock` | Locked Medusa graph at 2.17.2 |
| `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725/apps/backend/medusa-config.ts` | Registers five custom modules; no payment/fulfillment provider overrides |
| `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725/apps/backend/README.md` | db:generate / migrate / sync-links operator pattern |
| `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725/apps/backend/scripts/migrate-only.sh` | Production-safe `medusa db:migrate` entry |

### Custom modules

| Path | Purpose |
|---|---|
| `…/src/modules/payment-link/models/payment-link.ts` | PaymentLink DML model (order\|lead soft link + payment status enum) |
| `…/src/modules/payment-link/service.ts` | MedusaService CRUD for PaymentLink |
| `…/src/modules/payment-link/index.ts` | Module registration (`paymentLinkModuleService`) |
| `…/src/modules/bespoke-request/models/bespoke-request.ts` | BespokeRequest + mixed CRM/payment/production status enum |
| `…/src/modules/bespoke-request/service.ts` | MedusaService CRUD for BespokeRequest |
| `…/src/modules/bespoke-request/index.ts` | Module registration (`bespokeRequestModuleService`) |
| `…/src/modules/lead/models/lead.ts` | Lead intake model (free-text status) |
| `…/src/modules/lead/service.ts` | MedusaService CRUD for Lead |
| `…/src/modules/lead/index.ts` | Module registration (`leadModuleService`) |
| `…/src/modules/product-extension/models/product-type.ts` | ProductClassification STANDARD/CONFIGURABLE/BESPOKE |
| `…/src/modules/product-extension/service.ts` | MedusaService for ProductClassification |
| `…/src/modules/product-extension/index.ts` | Module registration (`productExtensionModuleService`) |
| `…/src/modules/room-set/models/room-set.ts` | RoomSet catalog entity |
| `…/src/modules/room-set/models/room-set-item.ts` | RoomSetItem join rows |
| `…/src/modules/room-set/service.ts` | MedusaService for RoomSet + items |
| `…/src/links/product-product-extension.ts` | Product ↔ ProductClassification link definition |
| `…/src/links/room-set-product.ts` | RoomSetItem ↔ Product link definition |

### Cart / classification gate / APIs

| Path | Purpose |
|---|---|
| `…/src/api/middlewares.ts` | BESPOKE cart block + runtime identity headers |
| `…/src/api/cart-classification-gate.ts` | Pure fail-closed classification gate |
| `…/src/api/store/carts/[id]/line-items/route.ts` | Store add-to-cart override (configured pricing) |
| `…/src/api/admin/payment-links/route.ts` | Admin list/create PaymentLinks |
| `…/src/api/admin/payment-links/[id]/route.ts` | Admin get/patch PaymentLink status/url |
| `…/src/api/admin/bespoke-requests/route.ts` | Admin list BespokeRequests (optional status filter) |
| `…/src/api/admin/bespoke-requests/[id]/route.ts` | Admin get/patch BespokeRequest status/notes |
| `…/src/api/store/bespoke-requests/route.ts` | Public create BespokeRequest (rate-limited) |
| `…/src/api/store/leads/route.ts` | Public create Lead |
| `…/src/api/admin/leads/route.ts` | Admin list Leads |
| `…/src/api/admin/leads/[id]/route.ts` | Admin retrieve Lead |
| `…/src/api/store/_lib/public-mutation-rate-limit.ts` | In-memory rate limit helper for public POSTs |

### Storefront checkout (order creation client)

| Path | Purpose |
|---|---|
| `…/apps/storefront/src/lib/api/checkout.ts` | Shipping + `pp_system_default` payment session + completeCart |
| `…/apps/storefront/src/components/checkout-form.tsx` | Checkout UX; success on Medusa `type === "order"` |

### Product / architecture docs (contracts)

| Path | Purpose |
|---|---|
| `…/docs/data-model.md` | Canonical custom entities incl. PaymentLink ↔ order\|lead |
| `…/docs/architecture.md` | Ecommerce vs Bespoke payment-link flows |
| `…/docs/api.md` | High-level REST contracts (cart/order/payment link) |
| `…/docs/development-rules.md` | PaymentLink entity rules (order + lead only) |
| `…/docs/backend/SCHEMA_COMPATIBILITY_CONTRACT.md` | product_classification + BESPOKE cart guard contract |
| `…/docs/storefront-phase1.md` | Checkout without on-site payment; CTA by product_type |
| `…/docs/MASTER_PRD.md` | Product vision (note: older PaymentLink shape with `lead_id` in one section) |

### Explicitly absent (important negatives)

| Path / area | Status |
|---|---|
| `apps/backend/src/workflows/**` | **Absent** |
| `apps/backend/src/subscribers/**` | **Absent** |
| `apps/backend/src/api/**/orders/**` | **Absent** |
| `apps/backend/src/modules/**/migrations/**` | **Absent in current tree** |
| Custom fulfillment / tracking module | **Absent** |
| Payment provider config (Stripe etc.) | **Absent** |

---

## 11. Risks / gaps for sales-order lifecycle work

1. **No Woodright Order extension** - lifecycle would either invent metadata conventions, a new module, or overburden BespokeRequest.
2. **BespokeRequest.status is overloaded** - payment + manufacturing + CRM in one enum.
3. **PaymentLink is decoupled** - no FK, no sync with Medusa payment_status or BespokeRequest.paid.
4. **Fulfillment / tracking blank** - manual Medusa only; no shipment fields.
5. **Migrations not vendored** - regeneration discipline required before schema changes ship.
6. **MASTER_PRD PaymentLink sketch** (`lead_id`) diverges from implemented `entity_type` + `entity_id` model - implement against code + `docs/data-model.md`.
7. **`ensure-checkout-ready` referenced but missing** - operational gap for shipping/payment bootstrap.
8. **No order subscribers** - cannot auto-create PaymentLink or advance statuses on order.placed.

---

## 12. Audit method notes

- Read-only inspection of the named worktree only.
- Versions from `package.json` + `yarn.lock` resolutions.
- `node_modules` not installed in this worktree at audit time; transitive package list taken from lockfile.
- Live DB schema / applied MikroORM migrations **not** inspected.
)
