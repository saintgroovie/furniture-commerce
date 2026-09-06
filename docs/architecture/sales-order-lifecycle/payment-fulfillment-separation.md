# Payment / fulfillment separation

## Principle

Admin manufacturing stage selector **never** writes Medusa payment or fulfillment status.

## Payment buyer labels (derived)

See also `architecture-repair-codex-r1.md` §1 (payment truth).

**Medusa payment facts are authoritative** for refunded/captured/paid.

PaymentLink is an operator overlay. When marked `paid` without Medusa capture, buyer label is **«Оплата отмечена менеджером»** (`operator_marked_paid`), never silently identical to PSP-confirmed paid. Prefer storing `verified_by` / `verified_at` / `verification_source` on PaymentLink when extended.

Priority for MVP:

1. Medusa `refunded` → «Возвращено» (wins over PaymentLink paid)
2. Medusa `partially_refunded` → «Оплачено частично»
3. Medusa `captured` / `paid` → «Оплата подтверждена»
4. PaymentLink `paid` (manual) → «Оплата отмечена менеджером»
5. PaymentLink `sent` → «Ожидает оплаты»
6. Medusa `not_paid` / `awaiting` / system checkout default → «Ожидает оплаты»

Admin manufacturing widget shows payment as **read-only** and cannot PATCH payment.

## Delivery buyer labels (derived)

From Medusa `fulfillment_status` (+ tracking if present):

| Signal | Buyer label |
|---|---|
| not_fulfilled / null | Ещё не передан в доставку |
| partially_fulfilled / fulfilled (packed) | Готовится к отправке |
| shipped | Передан в доставку |
| delivered | Доставлен |
| showroom handoff note (future metadata) | Выдан в шоуруме |

Tracking: carrier + number + URL → CTA «Отследить доставку».

Admin cannot set these via Woodright stage widget.

## Consolidated customer status

`deriveCustomerOrderStatus` precedence:

1. canceled
2. on_hold
3. fulfillment delivered
4. fulfillment shipped
5. ready_for_delivery
6. quality_control
7. in_production
8. awaiting_customer_approval
9. specification_in_progress
10. needs_confirmation
11. payment awaiting (when process ≤ confirmed and unpaid)
12. confirmed
13. new

Returns: `code`, `label`, `description`, `tone`, `progress_step`, `next_expected_action`, `estimated_date`, `tracking?`.
