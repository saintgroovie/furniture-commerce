# Woodright storefront - order / account flow audit

**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725`  
**Scope:** `apps/storefront` (read-only)  
**Date:** 2026-07-25

## Executive summary

Storefront today is a **guest cart → checkout → inline success** purchase path, plus a separate **lead / bespoke request** path. There is **no account area**, **no order list/detail routes**, **no guest order lookup**, and **no post-purchase tracking UI** beyond showing a display order number on checkout success.

---

## 1. Account order list pages

**Not present.**

- No `apps/storefront/src/app/account/**` (or similar) routes.
- App Router pages under `apps/storefront/src/app/` include: `cart`, `checkout`, `catalog`, `product/[id]`, `bespoke/*`, `rooms/*`, `kids/*`, `designers/*`, `contacts`, `about/*`, `qa/*` - no orders/account.
- Header has cart link only (`header-cart-link.tsx` → `/cart`); no login / account / orders nav.

---

## 2. Order detail pages

**Not present.**

- No `/orders/[id]`, `/account/orders/*`, or order retrieve pages.
- Order object is used only transiently after `completeCart` inside checkout success UI (see §3).

---

## 3. Guest order confirmation / retrieval

### Confirmation (exists, inline)

| Path | Notes |
|------|--------|
| `/checkout` | `apps/storefront/src/app/checkout/page.tsx` renders `CheckoutForm` |
| Success state | Same page; no dedicated `/order/confirmation` URL |

Flow (`apps/storefront/src/components/checkout-form.tsx`):

1. Read `cart_id` cookie → `getCart`
2. Submit contacts → `updateCart` (email + shipping_address)
3. `prepareCheckoutForCompletion` (shipping option + system payment session)
4. `completeCart` → expect `{ type: "order", order }`
5. Show `getOrderDisplayNumber(order)` + copy “Сохраните номер…”
6. `clearCartIdFromSession()`; CTA back to `/catalog`

Display number helper: `apps/storefront/src/lib/format.ts` → `getOrderDisplayNumber` (`custom_display_id` → `display_id` → truncated `order_` id).

Copy: `checkoutCopy` in `apps/storefront/src/lib/woodright-copy.ts` (`orderNumberLabel`, `orderNumberNote`, `successTitle`, `paymentNote`).

### Guest retrieval / lookup (absent)

- No “find my order by email / phone / number” page or API client.
- No calls to `/store/orders` anywhere in storefront.
- After success, buyer is expected to **keep the number and contact the manager** (copy only).

---

## 4. Cart / checkout flows and CTAs (purchase vs quote vs bespoke)

### Purchase path

| Step | Route / file | CTA |
|------|----------------|-----|
| Add to cart | PDP `ProductCta` | `actions.addToCart` (“Добавить в корзину”) |
| Cart | `/cart` → `CartSummary` | `actions.checkout` (“Оформить заказ”) → `/checkout` |
| Checkout | `/checkout` → `CheckoutForm` | `checkoutCopy.submit` (“Отправить заказ”) |
| Success | same `/checkout` | `checkoutCopy.successCta` → `/catalog` |

Files:

- `apps/storefront/src/app/cart/page.tsx`
- `apps/storefront/src/components/cart-summary.tsx`
- `apps/storefront/src/app/checkout/page.tsx`
- `apps/storefront/src/components/checkout-form.tsx`
- `apps/storefront/src/components/product-cta.tsx`
- `apps/storefront/src/components/header-cart-link.tsx` (nav to `/cart`)

Checkout is **no online payment in MVP**: system provider `pp_system_default` via `prepareCheckoutForCompletion` (`apps/storefront/src/lib/api/checkout.ts`). Copy stresses manager confirms then sends payment link.

### Quote / bespoke path (not cart)

| Entry | CTA | Destination |
|-------|-----|-------------|
| BESPOKE PDP | “Запросить расчёт” | `/bespoke/request?product_id=…` (+ optional `material`) |
| `launch_mode=request_quote` PDP | “Оставить заявку” | same `/bespoke/request` |
| CONFIGURABLE secondary | “Сделать по моим размерам” | same |
| Room set secondary | “Адаптировать под мою комнату” | `/bespoke/request?room_set_id=…` |
| Marketing | `/bespoke`, `/bespoke/catalog` | content + request |

Form: `apps/storefront/src/app/bespoke/request/page.tsx` + `apps/storefront/src/components/bespoke-form.tsx`  
API: `createLead` → `createBespokeRequest` (not Medusa cart/order).

### Room set purchase CTA

`apps/storefront/src/components/room-set-cta.tsx`:

- Primary: “Купить комплект” - adds **non-BESPOKE** line items only
- Secondary: bespoke adapt link
- Note if set contains BESPOKE items

---

## 5. ProductClassification → add-to-cart behavior

Classification read from `product.product_classification.product_type` (fallback `custom_product_type`) in `ProductCta`.

| Type / mode | Storefront CTA behavior |
|-------------|-------------------------|
| **BESPOKE** | No add-to-cart. Link only to `/bespoke/request`. Comment in `bespoke.ts`: cart rules enforced by **backend middleware**. |
| **request_quote** (`metadata.launch_mode === "request_quote"`) | Same as quote path: link to `/bespoke/request`, no cart. Helper: `apps/storefront/src/lib/request-quote.ts`. |
| **CONFIGURABLE** | Add-to-cart (first variant + PDP execution/material metadata) **plus** secondary bespoke link. |
| **STANDARD** (default branch) | Add-to-cart only (when variant + selection gate allow). |

Add-to-cart details (`product-cta.tsx`):

- `ensureCart()` → `addLineItem(cartId, { variant_id, quantity: 1, metadata })`
- Metadata may include: `execution_image`, `execution_specs`, `material_execution_code`, `finish_execution_key`, `storefront_section: "kids"`, `configuration_identity`
- Selection gate via `apps/storefront/src/lib/cart/pdp-selection.ts` can block until buyer picks parameters

Catalog filter type union: `apps/storefront/src/lib/catalog-filters.ts` (`STANDARD` \| `CONFIGURABLE` \| `BESPOKE`).

Catalog cards do **not** add to cart directly (link to PDP); price may show request-quote label via `catalog-card-price.ts`.

---

## 6. Order tracking UI

**Absent** as a product surface.

Closest UX:

- Checkout success: display order number + “save for payment / manager questions”
- Aside “Что дальше” bullets (confirm composition, delivery, payment link) - informational, not live status

No shipment status, timeline, or order history components found.

---

## 7. API clients used for orders / purchase

Directory: `apps/storefront/src/lib/api/`

| Module | Endpoints / role | Order-related? |
|--------|------------------|----------------|
| `base.ts` | `getBaseUrl`, `medusaFetch` (+ publishable key), `medusaCatalogFetch` | Shared |
| `cart.ts` | `POST/GET /store/carts`, line-items add/remove, update email/address | Pre-order |
| `checkout.ts` | regions, shipping-options/methods, payment-collections/sessions, `POST …/carts/:id/complete` | **Creates order** |
| `leads.ts` | `POST /store/leads` | Quote funnel |
| `bespoke-requests.ts` | `POST /store/bespoke-requests` | Quote funnel |
| `products.ts`, `room-sets.ts`, `motif-themes.ts` | Catalog | No |

**No** `orders.ts` / customer orders client.

Browser uses same-origin empty base + Next rewrites to Medusa; server uses `MEDUSA_BACKEND_*` env. Mutations: `cache: "no-store"`.

---

## 8. Auth / customer session patterns for order access

**No customer auth** in storefront for orders.

| Mechanism | Purpose |
|-----------|---------|
| Cookie `cart_id` | Anonymous cart session (`apps/storefront/src/lib/cart/session.ts`: 30d, `SameSite=Lax`, `Secure` on HTTPS) |
| `x-publishable-api-key` | Medusa store API via `medusaFetch` |
| Checkout form fields | Guest email/phone on cart shipping_address - not a login |

`middleware.ts` is **security headers / CSP / robots** only - not auth gate.

After order completion, cart cookie is cleared; there is **no order cookie / token** for later retrieval. Access to past orders is effectively **out of band** (manager + saved number).

---

## Route map (purchase-relevant)

```
PDP /product/[id]  --ProductCta-->  cart cookie + /store/carts/.../line-items
                 \--BESPOKE|quote-->  /bespoke/request  --> leads + bespoke-requests

/cart  --Оформить заказ-->  /checkout  --complete-->  inline success (order number)
```

---

## Gaps vs a full sales-order lifecycle UX

1. No account order list / detail  
2. No guest order lookup by number/email  
3. No dedicated confirmation URL / email deep-link page  
4. No tracking / status UI after checkout  
5. No storefront `/store/orders` (or customer) API usage  
6. Purchase and quote are intentionally split; BESPOKE blocked from cart on UI (and noted as BE middleware)

---

## Key file index

| Area | Absolute path |
|------|----------------|
| Cart page | `.../apps/storefront/src/app/cart/page.tsx` |
| Checkout page | `.../apps/storefront/src/app/checkout/page.tsx` |
| Cart UI | `.../apps/storefront/src/components/cart-summary.tsx` |
| Checkout UI | `.../apps/storefront/src/components/checkout-form.tsx` |
| PDP CTA | `.../apps/storefront/src/components/product-cta.tsx` |
| Room set CTA | `.../apps/storefront/src/components/room-set-cta.tsx` |
| Bespoke form | `.../apps/storefront/src/components/bespoke-form.tsx` |
| Cart cookie session | `.../apps/storefront/src/lib/cart/session.ts` |
| Cart API | `.../apps/storefront/src/lib/api/cart.ts` |
| Checkout API | `.../apps/storefront/src/lib/api/checkout.ts` |
| Leads / bespoke API | `.../apps/storefront/src/lib/api/leads.ts`, `bespoke-requests.ts` |
| Request-quote helper | `.../apps/storefront/src/lib/request-quote.ts` |
| Bespoke catalog filter | `.../apps/storefront/src/lib/bespoke.ts` |
| Order display number | `.../apps/storefront/src/lib/format.ts` |
| UX copy | `.../apps/storefront/src/lib/woodright-copy.ts` |
| Middleware (non-auth) | `.../apps/storefront/src/middleware.ts` |
