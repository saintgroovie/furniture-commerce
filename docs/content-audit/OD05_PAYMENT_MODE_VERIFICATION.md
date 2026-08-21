# OD-05 Payment mode — implementation verification (canonical)

**Date:** 2026-08-15 (Europe/Moscow)
**Tree:** canonical checkout (`apps/storefront` + `apps/backend`)
**Mode:** evidence + owner ratification. Buyer-facing storefront copy **not** changed in this task.

**Ratification:** `OD-05 = A` · `OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK` · `WOODRIGHT_OD05_PAYMENTLINK_INVOICE_OWNER_RATIFIED`

Related: `OD-01 = A`, `OD-10 = B` (`PUBLIC_BANK_DETAILS = NO`). Full legal pack not approved. `OD-06` split 2026-08-20: see `20260820_LAUNCH_COMPLETION.md` (submit = request, not acceptance; no extra SLA).

---

## Candidate A (owner question)

```text
Покупатель оформляет заказ на сайте
→ заказ создаётся без немедленной оплаты на checkout
→ менеджер проверяет/подтверждает заказ
→ менеджер отправляет покупателю ссылку на оплату или счёт
→ оплата происходит после подтверждения заказа
→ статус оплаты фиксируется менеджером / существующей payment-моделью
```

## Verdict for ratification

```text
IMPLEMENTED_JOURNEY ≈ Candidate A
MATCH = YES, WITH OPERATIONAL CAVEATS
ONLINE_PSP_ON_CHECKOUT = NO
INSTALLMENT_IN_NEW_STACK = NO
OD-05 = A — OWNER CONFIRMED
OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK
/payment = READY_FOR_COPY_PHASE
```

Owner chose **A**: Keep manual invoice / PaymentLink as sole public payment story at launch.

---

## Step-by-step vs code

| Candidate A step | In canonical code? | Evidence | Caveat |
| --- | --- | --- | --- |
| Buyer places order on site | **YES** | `checkout-form.tsx`: `updateCart` → `prepareCheckoutForCompletion` → `completeCart` | CTA «Отправить заказ», not «Оплатить» |
| Order created without taking money on checkout | **YES** | `checkout.ts`: payment session `provider_id: "pp_system_default"` (Medusa no-op plumbing). `ensure-checkout-ready.ts`: «no-payment MVP». Copy: «Сейчас оплачивать заказ не нужно» | `pp_system_default` is **not** a PSP. Medusa may internally mark the payment session complete so the cart can become an order. That is **not** a card charge |
| Manager reviews / confirms | **YES as process, not as a coded gate** | Success copy: «Заказ отправлен на подтверждение». No custom order-confirmation workflow / subscriber | Confirmation is operational (phone/messenger), not a storefront button |
| Manager sends payment link or invoice | **YES as capability, not automated** | Admin `POST /admin/payment-links` (manager supplies `url`). PRD template: «Ссылка на оплату». Copy promises «пришлёт ссылку на оплату» | Backend **does not generate** PSP URLs and **does not email/SMS** the link. No Admin UI widget - REST only. Send can be WhatsApp / email / PaymentLink URL pasted by manager |
| Payment after confirmation | **YES (off-site)** | PaymentLink `url` is external; no Stripe/YooKassa/Tinkoff module in `medusa-config.ts` | What lives at `url` is operator-chosen (invoice, bank details in a private message, third-party pay form). **Not** public `/requisites` bank block (`OD-10 = B`) |
| Status recorded | **YES on PaymentLink; limited buyer UI** | Model status: `created` \| `sent` \| `paid` \| `expired`. `PATCH /admin/payment-links/:id`. No webhook | Canonical storefront has **no** `/orders/track` and **no** buyer labels «Ожидает оплаты / отмечена менеджером / подтверждена». Those labels exist in richer legal/rem worktrees, not this tree |

---

## What is **not** implemented (do not promise)

- Online acquiring on checkout (card form, QR widget, Sberbank pay button)
- Named PSP integration (no Stripe/YooKassa credentials wiring in canonical apps)
- Installment / «своя рассрочка» (live CS-Cart only - `STALE` vs new stack)
- Auto-send of PaymentLink on `order.placed` (no subscribers)
- Store API for PaymentLink (admin-only)
- Public bank details as a payment method (`OD-10 = B`)

Live `woodright.ru/oplata-i-dostavka/` (card / QR / Sberbank / installment) is **LEGACY DIVERGENCE / NOT NEW-SITE SOT**. Do not port without a new owner decision **and** implementation. CF-02 remains as historical conflict (resolved for *new-site* SoT by OD-05 = A).

---

## Canonical vs richer worktrees

| Piece | Canonical (this checkout) | Rem / designers / ops worktrees |
| --- | --- | --- |
| Checkout + `pp_system_default` | present | present |
| PaymentLink admin CRUD | present | present |
| `WOODRIGHT_PAYMENT_MODE=manual_invoice` | **absent** | present (`payment-mode.ts`) |
| `WOODRIGHT_PAYMENT_LAUNCH_MODE=manager_payment_link` | **absent** | present |
| Buyer status labels | not in storefront | `MANAGER_PAYMENT_LAUNCH_COPY` + `/payment` legal page |
| `/payment` route | **404 / missing** | legal stub |

Owner can still ratify Candidate A for **canonical**: the buyer journey is already that model. Launch-readiness env tokens live in other trees and are **not** a second payment product.

---

## Honest public story (COPY authority after OD-05 = A)

Storefront text is **not** updated in this task. Approved sense for later copy phase:

> Оплачивать заказ сразу на сайте не нужно. После оформления менеджер проверит детали заказа и отправит ссылку на оплату или счёт.

Do **not** add: PSP names, bank list, QR, installment, send SLA, instant-pay guarantee.

`/payment` = **READY_FOR_COPY_PHASE**.

---

## Owner ratification (executed 2026-08-15)

```text
OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK
OD-05 = A
LAUNCH_PAYMENT_MODE = manager_payment_link / manual_invoice
ONLINE_CHECKOUT_PSP = NO
```

Acquiring or installment would still be a **separate build** (former B/C), not a copy flip. `OD-06` is not implied.
