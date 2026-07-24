# Architecture repair notes (Codex round 1)

Codex status was `request-changes`. This file closes P0/P1 gaps before implementation.

## 1. Payment truth (P0)

**Authoritative money facts for Medusa checkout path:** Medusa `payment_status` / payment collections.

**PaymentLink** is an **operator business overlay**, not a PSP capture proof.

Buyer payment mapping rules:

1. If Medusa status is refunded / partially_refunded / captured / paid → use Medusa-derived buyer labels.
2. Else if PaymentLink for order is `paid`:
   - Require fields on PaymentLink (additive, non-breaking defaults): `verified_by` (admin id nullable), `verified_at`, `verification_source` (`manual_admin` | `psp_webhook` | `import`).
   - Buyer label: **«Оплата отмечена менеджером»** (not identical to «Оплата подтверждена»).
   - `code`: `operator_marked_paid`.
3. Else PaymentLink `sent` → «Ожидает оплаты» (`awaiting_payment_link`).
4. Else Medusa not_paid after system checkout → «Ожидает оплаты».

Admin manufacturing widget never edits payment. PaymentLink PATCH remains separate Admin API with audit note in process events optional follow-up.

Conflict: Medusa `refunded` wins over PaymentLink `paid` for buyer consolidated payment block.

## 2. Atomic lifecycle writes (P0)

`transitionOrderProcess` must run in **one DB transaction**:

1. Load process FOR UPDATE / equivalent
2. Validate transition (fail-closed)
3. Check idempotency key uniqueness (insert attempt first or unique constraint)
4. `UPDATE process SET …, version = version+1 WHERE id=? AND version=expected`
5. If rowCount=0 → 409 STALE_PROCESS_VERSION (rollback)
6. INSERT append-only event
7. INSERT notification outbox rows (pending) if notify requested
8. Commit
9. Emit domain event after commit (at-least-once OK; consumers idempotent)

Tests: concurrent transitions → one success, one 409; no event without version bump.

## 3. Guest access token (P0) — single model

**Chosen:** opaque high-entropy token (32+ bytes), store **only SHA-256 hash**.

Table `woodright_order_access`:

- `order_id` (unique active token per order MVP)
- `token_hash`
- `expires_at`
- `created_at`
- `revoked_at` nullable

Issuance: `POST /store/woodright/orders/:order_id/access` with `{ cart_id }` proving that cart completed into this order (query Medusa). Returns `{ token, expires_at, track_path }` **once** per successful mint (re-mint rotates hash).

Retrieval: `Authorization: Bearer <token>` preferred; `?token=` accepted once then client should drop from URL (document). Validation: constant-time hash compare, expiry, not revoked → else **404**.

No HMAC-in-query as primary design.

## 4. Notification outbox (P1)

Table `woodright_notification_delivery`:

- `id`, `event_id`, `channel` (`email`|`activity`), `recipient_key`, `status` (`pending`|`sent`|`failed`|`skipped`|`deduped`), `attempt_count`, `last_error`, `created_at`, `updated_at`
- UNIQUE (`event_id`, `channel`, `recipient_key`)

Worker/subscriber processes pending; fake provider in test/local.

## 5. Sales snapshot (P1)

Server-authoritative capture in cart complete / line-item add workflows (backend):

- Schema version `woodright_sales_snapshot_v1`
- Written only by backend into order item metadata
- Ignore/overwrite any client-supplied `woodright_sales_snapshot`
- Fields: sales_mode, modifiers, lead_time_text, configuration_summary, quote_ref, showroom_sample_id, customer_visible_promise, captured_at

## 6. Cart gate (P1)

Extend classification gate → `evaluateCartSalesGate`:

- Keep BESPOKE / missing classification fail-closed
- Also block: `unavailable`, `quote_required`, `bespoke_project`, `only_as_set` (unless set purchase path), showroom qty > available
- `configurable_to_order` requires configuration payload when policy says so

## 7. Migrations (P1)

Implementation incomplete without checked-in migration SQL (or Medusa generated migration files) + fidelity test that models match expected table names. Fresh local migrate when DB available; no prod migrate.

## CAS persistence (Codex r2)

Transitions persist via SQL `UPDATE … WHERE id=? AND version=? RETURNING *` inside a transaction (PG_CONNECTION). Unconditional MedusaService update fallback removed (fail-closed if SQL unavailable).
