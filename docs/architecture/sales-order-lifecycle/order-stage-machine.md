# Order stage state machine (fail-closed)

## Stages (Woodright production only)

| Stage | Owner | Buyer |
|---|---|---|
| `new` | Новый заказ | Заказ получен |
| `needs_confirmation` | Требует подтверждения | Уточняем детали заказа |
| `specification_in_progress` | Согласование комплектации | Согласовываем материалы и комплектацию |
| `awaiting_customer_approval` | Ожидает согласования клиента | Ожидаем вашего подтверждения |
| `confirmed` | Подтверждён | Заказ подтверждён |
| `in_production` | В производстве | Изготавливаем ваш заказ |
| `quality_control` | Проверка качества | Проверяем готовое изделие |
| `ready_for_delivery` | Готов к передаче | Заказ готов к доставке или самовывозу |
| `on_hold` | Приостановлен | Работа по заказу временно приостановлена |
| `canceled` | Отменён | Заказ отменён |

`canceled` **only** when Medusa order is canceled (or cancellation workflow confirmed). Admin cannot set canceled via ordinary stage select without that guard.

## Allowed transitions (normal)

```
new → needs_confirmation | confirmed
needs_confirmation → specification_in_progress | confirmed | on_hold
specification_in_progress → awaiting_customer_approval | confirmed | on_hold
awaiting_customer_approval → specification_in_progress | confirmed | on_hold
confirmed → in_production | on_hold
in_production → quality_control | on_hold
quality_control → in_production | ready_for_delivery | on_hold
ready_for_delivery → on_hold   # delivery facts come from fulfillment
any working (not canceled) → on_hold
on_hold → previous_stage (must be recorded) OR explicit allowed resume target from resume map
```

Resume map for `on_hold`: only to `previous_stage` if previous was working; else admin picks from allowed set for that previous.

## Forbidden (examples)

- `new` → `quality_control` / `ready_for_delivery`
- `in_production` → `new`
- any → active after Medusa `canceled`
- `canceled` → any active (no reopen in MVP)

## Correction flow

Requires: `correction=true`, mandatory reason (≥10 chars), admin permission, separate confirmation flag, audit `event_type=stage_changed` with `source=correction`.

Still cannot invent payment/fulfillment facts.

## Concurrency

Lifecycle writes are **one DB transaction** (see `architecture-repair-codex-r1.md` §2):

- validate → CAS `version` → append event → insert notification outbox → commit
- Update requires `expected_version`
- Mismatch → HTTP 409 `{ code: "STALE_PROCESS_VERSION" }`
- Idempotency-Key: unique per process; replay same body; conflict on different body

## Customer actions MVP

API contract prepared for `awaiting_customer_approval`:
- `confirm` → `confirmed`
- `request_changes` → `specification_in_progress`

**UI buttons:** deferred — read-only timeline + contract tests only (no fake buttons).
