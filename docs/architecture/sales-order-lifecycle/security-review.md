# Security review (pre-implementation)

## Current gaps

1. **No customer account / order ownership UI** — checkout is guest + `cart_id` cookie.
2. **No store order retrieve client** — success only shows display number inline.
3. **Guessable display ID risk** if we add public lookup by display_id alone.
4. **BespokeRequest.status** mixes CRM/payment/production — must not become manufacturing SoT for Medusa orders.
5. **PaymentLink** soft-links by `entity_id` string — no FK; do not treat as Medusa payment SoT.

## Required controls for MVP

- Guest access: HMAC-signed short-lived token bound to `order_id` (not display_id alone).
- Store API: strip `internal_note`, actor admin IDs, workflow/correlation internals where not customer-safe.
- Admin writes: auth + validation + optimistic `version` + idempotency key.
- IDOR negative tests: foreign order_id + wrong/missing token → 404/403 (no existence leak preferred: 404).
- Never expose payment provider secrets / PaymentLink admin URLs to store process DTO unless already buyer-facing.

## Non-goals this cycle

- Full customer auth/account system
- Live PSP webhooks
- Production DB migration
