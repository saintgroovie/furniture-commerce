# Public production catalog data promotion

## Status

Approved technical method for **isolated** `woodright_public_production` only.

Authorization for executing this method on the operator host requires the
owner technical-provisioning token (not buyer DNS cutover).

## Method

`ops/release/promote-catalog-to-public-production.sh --confirm-catalog-promote`

1. `pg_dump -Fc` from the approved catalog source (default: private
   `woodright_production` / production_candidate Postgres).
2. Restore into empty `woodright_public_production` (never into demo/candidate).
3. Scrub customers, orders, carts, payments, sessions, notifications, leads,
   bespoke requests (CASCADE truncate list in the script).
4. Keep catalog products/variants/prices/media refs, sales channel,
   publishable API keys, and admin user needed for Medusa boot.
5. Prove product/variant counts match source; customers/orders/carts = 0.

## Explicit exclusions

- Legacy CS-Cart buyers/orders
- Demo/session/test carts retained as live history
- Blind full staging dump without scrub
- Reusing demo or private DB volumes as the writable production target

## Media

Catalog promotion is DB-only. Media is a separate read-source → new volume copy
into `woodright-public-production_woodright_public_media`.

## Not implied

- Public DNS / Traefik buyer cutover
- Legal content approval
- Payment decision `accepted_manual`
- Notification policy
