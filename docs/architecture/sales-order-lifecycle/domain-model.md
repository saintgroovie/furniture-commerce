# Domain model — sales modes + order lifecycle

**Base:** Medusa `2.17.2` @ `081da6e`  
**Rule:** four independent axes. Never collapse into one `status`.

## Axes

| Axis | Owner | Purpose |
|---|---|---|
| A. Product publication | Medusa Product `status` | draft / published / archived |
| B. Product sales mode | Woodright `product_sales_policy` | how buyer may acquire |
| C. Order production stage | Woodright `woodright_order_process` | manufacturing/business progress |
| D. Payment + fulfillment | Medusa core (+ PaymentLink as business overlay) | money + shipment facts |

## Entities (new)

### `product_sales_policy`

Linked to Product (module link). One policy per product (MVP).

| Field | Notes |
|---|---|
| `id` | PK |
| `sales_mode` | enum (see sales-mode-matrix) |
| `modifiers` | JSON string array of modifier codes |
| `lead_time_text` | buyer-facing estimate text |
| `buyer_message` | optional buyer explanation |
| `manager_confirmation_required` | boolean |
| `related_room_set_id` | required when `only_as_set` |
| `showroom_sample_available` | boolean |
| `unavailable_reason` | text, when unavailable |
| `policy_source` | `override` \| `unspecified` |
| `created_at` / `updated_at` | timestamps |

Missing policy ⇒ **compat projection** from `ProductClassification` (read-time only; no auto-write).

### `woodright_order_process`

One row per Medusa Order (created on `order.placed` / ensure-on-read).

| Field | Notes |
|---|---|
| `id` | PK |
| `order_id` | Medusa order id (unique) |
| `current_stage` | production stage enum |
| `previous_stage` | nullable |
| `estimated_completion_date` | nullable date |
| `customer_message` | buyer-visible |
| `internal_note` | admin-only; never Store API |
| `paused_reason` | when on_hold |
| `version` | optimistic concurrency integer |
| `created_at` / `updated_at` | timestamps |

### `woodright_order_process_event`

Append-only history.

| Field | Notes |
|---|---|
| `id` | PK |
| `process_id` / `order_id` | refs |
| `previous_stage` / `next_stage` | |
| `event_type` | created / stage_changed / paused / resumed / estimate_changed / customer_action_required / notification |
| `actor_type` | system / admin / customer |
| `actor_id` / `actor_display` | display may be redacted on Store |
| `customer_visible` | boolean |
| `customer_message` | nullable |
| `internal_note` | admin-only |
| `notification_requested` | boolean |
| `notification_result` | pending / sent / skipped / failed / deduped |
| `source` | subscriber / admin_api / customer_api / correction |
| `idempotency_key` | unique nullable |
| `correlation_id` | nullable |
| `created_at` | |

### Order line sales snapshot

Server-authoritative only. Schema `woodright_sales_snapshot_v1` written by backend during add-to-cart / complete workflows into order item metadata. Client-supplied snapshot keys are ignored/overwritten. See repair notes §5.

### Access + notifications

- `woodright_order_access` — opaque token hashes for guest track
- `woodright_notification_delivery` — per-channel outbox with unique constraint

## Explicit non-entities

- Do **not** extend `BespokeRequest.status` for Medusa Order manufacturing.
- Do **not** invent admin-editable payment/fulfillment enums.
- Do **not** fork `@medusajs/order`.

## Computed contracts (pure libs)

- `buildBuyerPurchaseContract(policy, inventoryHints, classification)` → Store DTO
- `deriveCustomerOrderStatus({ process, payment, fulfillment, canceled })`
- `assertStageTransition(from, to, { correction })`
- `mapPaymentBuyerLabel` / `mapDeliveryBuyerLabel` (Medusa authoritative; PaymentLink overlay labeled distinctly)
