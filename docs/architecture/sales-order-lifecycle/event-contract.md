# Event contract

## Domain events

| Event | When |
|---|---|
| `woodright.order_process.created` | initial process row |
| `woodright.order_process.stage_changed` | validated transition |
| `woodright.order_process.customer_action_required` | enter awaiting_customer_approval |
| `woodright.order_process.customer_responded` | customer action API |
| `woodright.order_process.estimate_changed` | estimate update without stage change |
| `woodright.order_process.paused` | → on_hold |
| `woodright.order_process.resumed` | leave on_hold |

Do not use generic `order.updated` as sole manufacturing source.

## Subscribers (MVP)

1. **order.placed** → ensure process `new` + created event + optional guest token metadata + notify «заказ получен» (fake provider in test/local).
2. **stage_changed handler** → notification dispatch (idempotent by event id).
3. **fulfillment shipped/delivered** (if Medusa emits) → customer-visible timeline event **without** changing production stage (except notes); consolidated status updates via derive.

## Notifications

Channels MVP: `email` (fake/test), `activity` (event row).

Outbox table `woodright_notification_delivery` with UNIQUE (`event_id`, `channel`, `recipient_key`).  
Statuses: pending | sent | failed | skipped | deduped.

Local/test: `WOODRIGHT_NOTIFICATIONS=fake` (default outside production). Never send real email in unit tests.
