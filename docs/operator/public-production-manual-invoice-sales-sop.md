# Public production - manual invoice sales SOP (template)

Version: `manual-invoice-sop-v1`  
Environment: `public_production`  
Status: **template for owner acceptance** - not an approved operating schedule until owner token.

This SOP is required when payment decision is:

`MANUAL_INVOICE_ACCEPTED_FOR_LAUNCH`

## 1. Where the order appears

- Medusa Admin → Orders (new order after storefront checkout complete)
- Woodright Admin → Производство (`/app/woodright/production`) - process stage `new`
- Order detail widget: Woodright process stages

There is **no** automatic sales email today (fake outbox only).

## 2. Who checks the queue

Owner must name:

- Primary role / person: `________________`
- Backup role / person: `________________`

## 3. Polling frequency

- Business hours check every: `____` minutes (recommended ≤ 30)
- Outside hours: `________________`

## 4. Buyer contact

- Channel: phone / Telegram / WhatsApp / email (circle)
- Script: confirm availability, price, lead time, delivery
- Do **not** tell buyer the order is already paid

## 5. Invoice / payment

- How invoice/requisites are sent: `________________` (outside site)
- PaymentLink in Admin may be used to store URL + status overlay
- Mark PaymentLink `paid` only after real payment evidence

## 6. Record payment

- Where: PaymentLink status and/or Medusa notes: `________________`
- Who: `________________`

## 7. Cancel path

- Woodright stage → `canceled` with reason
- Buyer notified manually
- Do not imply refund unless refund actually processed

## 8. Refund path

- Process: `________________`
- Who approves: `________________`
- No automated refund API in Woodright checkout

## 9. Missed-order watch

- Daily reconciliation: compare Medusa new orders vs production board
- Escalation if order older than `____` minutes without contact

## 10. Escalation owner

- Name / role: `________________`
- Contact: `________________`
