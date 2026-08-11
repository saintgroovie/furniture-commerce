# API contract

## Store (buyer-safe)

### `GET /store/woodright/orders/:order_id/process`

Auth: `token` query (HMAC) **or** authenticated customer owning order (future).

Response:

```json
{
  "order_id": "...",
  "display_id": 1234,
  "customer_status": { "code": "...", "label": "...", "description": "...", "tone": "...", "progress_step": 3, "next_expected_action": "...", "estimated_date": null, "tracking": null },
  "payment": { "label": "...", "code": "..." },
  "production": { "stage": "...", "label": "...", "description": "...", "customer_message": "...", "estimated_completion_date": null },
  "delivery": { "label": "...", "code": "...", "tracking": null },
  "timeline": [{ "key": "received", "label": "...", "state": "done|current|upcoming" }],
  "events": [{ "id": "...", "at": "...", "label": "...", "message": null }]
}
```

Never: `internal_note`, admin actor ids, raw provider payloads.

### `POST /store/woodright/orders/:order_id/customer-actions` (contract + tests; UI optional)

Body: `{ action: "confirm"|"request_changes", comment?: string, idempotency_key }`  
Only when stage=`awaiting_customer_approval`.

### Product buyer contract

Extend existing product Store projection with `purchase` object from `buildBuyerPurchaseContract`.

## Admin

### `GET /admin/woodright/order-processes?filters…`

List for Production route.

### `GET /admin/woodright/order-processes/:order_id`

Full process + events (incl. internal) + derived payment/fulfillment read models + `allowed_transitions`.

### `POST /admin/woodright/order-processes/:order_id/transitions`

```json
{
  "to_stage": "in_production",
  "expected_version": 3,
  "estimated_completion_date": null,
  "customer_message": "...",
  "internal_note": "...",
  "notify_customer": true,
  "correction": false,
  "correction_reason": null,
  "idempotency_key": "..."
}
```

409 on stale version / idempotency conflict.  
400 on invalid transition.

### Product sales policy

- `GET/PUT /admin/woodright/products/:id/sales-policy`
- `DELETE` clears override (compat projection)

## Auth

Admin: Medusa admin auth.  
Store: signed guest token (see privacy-threat-model).
