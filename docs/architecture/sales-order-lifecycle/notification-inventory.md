# Notification inventory

**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725`  
**Scope:** notification modules/providers, email, subscribers, fake/test providers, event names  
**Date:** 2026-07-25

## Verdict

Woodright backend has **no notification module, no email provider, no subscribers directory, and no custom event emissions** in application code. Lead / bespoke-request / payment-link persistence is API-driven only - **no outbound notify path**.

---

## 1. Notification providers / modules

| Check | Result |
|-------|--------|
| `medusa-config.ts` `modules` notification entry | **Absent** |
| `@medusajs/notification` / notification provider deps in `apps/backend/package.json` | **Absent** (deps: framework, medusa, admin-sdk, sharp only) |
| Custom `src/modules/*notification*` | **None** |
| `Modules.NOTIFICATION` / `sendNotification` usage under `apps/backend/src` | **None** |

Registered custom modules only:

1. `product-extension`
2. `room-set`
3. `lead`
4. `bespoke-request`
5. `payment-link`

---

## 2. Email sending

| Check | Result |
|-------|--------|
| Nodemailer / Resend / SendGrid / SMTP / SES integrations | **Not found** in backend source |
| Template / mailer utilities under `apps/backend/src` | **None** |
| Payment link `status: "sent"` | Enum value exists on `payment_link` model; **no code path that sends email** observed |
| Lead `email` field | Stored on `lead` model / accepted by store leads API - **storage only** |

---

## 3. Subscribers (`apps/backend/src/subscribers`)

| Check | Result |
|-------|--------|
| Directory `apps/backend/src/subscribers` | **Does not exist** |
| Any `*subscriber*` files under `apps/backend` | **None** |
| EventBus subscribe / `subscriber` config | **None** in app source |

`apps/backend/src` top-level: `admin`, `api`, `lib`, `links`, `modules`, `scripts` only.

---

## 4. Fake / test notification providers

| Check | Result |
|-------|--------|
| Local / fake / console notification provider | **None** |
| Test doubles for notification in fidelity tests | **None** (no notification surface to mock) |

---

## 5. Event names already used (app layer)

Application code under `apps/backend/src` does **not** emit or subscribe to Medusa domain events (no `eventBus.emit`, no subscriber handlers).

**Implied lifecycle is request/response + DB only**, examples:

| Surface | Mechanism | Notify? |
|---------|-----------|---------|
| Store lead create | `POST /store/leads` → lead module | No |
| Store bespoke request | `POST /store/bespoke-requests` | No |
| Admin list/update bespoke / leads / payment links | Admin REST | No |
| Cart BESPOKE gate | Middleware on `POST /store/carts/:id/line-items` | No (HTTP 400/500) |
| Configured pricing add-to-cart | Route override `api/store/carts/[id]/line-items` | No |

**Payment link statuses** (model enum, not events): `created` | `sent` | `paid` | `expired`  
**Bespoke request statuses** (model enum, not events): `new` | `contacted` | `quote_sent` | `paid` | `in_production` | `completed`

No Woodright-defined event name constants (e.g. `order.placed` handlers) found in backend app code. Core Medusa framework events may still fire internally; **Woodright does not consume them**.

---

## 6. Gaps for sales-order lifecycle

- No channel to notify buyer or operator on lead / quote / payment-link / order transitions.
- `payment_link.status = "sent"` and `bespoke_request.status = "quote_sent"` are data states without delivery side effects.
- Adding notifications requires new module/provider wiring + subscribers (or workflow hooks) - greenfield in this worktree.
