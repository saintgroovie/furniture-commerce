# Privacy threat model

## Assets

- Order identity, stage, customer messages, payment/delivery labels, PII on order

## Threats

| Threat | Mitigation |
|---|---|
| IDOR by sequential display_id | Require HMAC token bound to `order_id` (+ exp); never lookup by display_id alone |
| Token reuse forever | TTL (e.g. 90 days) + version/secret rotation via JWT_SECRET |
| Internal notes leak | Separate DTO mappers; tests assert absence |
| Email/phone enumeration | 404 for bad token; no “wrong email” oracle |
| Admin actor exposure | Store events omit actor_id; optional redacted display |
| Guessable admin URLs | Admin auth required |

## Guest token (single model — opaque hashed)

See `architecture-repair-codex-r1.md` §3.

Table `woodright_order_access`: `order_id`, `token_hash` (SHA-256), `expires_at`, `revoked_at`.

- Mint: `POST /store/woodright/orders/:order_id/access` + `{ cart_id }` proving cart→order completion.
- Store only hash; return plaintext token once.
- Validate with constant-time compare; failures → **404**.
- Prefer `Authorization: Bearer`; query `token` allowed for first open then stripped client-side.
- Re-mint rotates hash (old token invalid).
- Negative + replay tests mandatory.

HMAC-in-query is **not** the primary design.

## Logging

No tokens/PII in logs beyond order id.
