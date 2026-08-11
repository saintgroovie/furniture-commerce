# Rollout plan

## This cycle

1. Architecture + Codex
2. Backend domain + APIs + tests
3. Admin widgets + Production route
4. Storefront CTA DTO consumption + track page
5. Scoped commits + push + PR
6. **No** public deploy, **no** woodright.ru, **no** demo runtime change

## PR strategy

Prefer **one vertical PR** if CI green and scope reviewable; else:

- PR A: domain/backend contracts + tests
- PR B: Admin
- PR C: storefront timeline
- PR D: product sales admin UI

Default: single branch `feat/sales-modes-order-lifecycle-20260725` with scoped commits matching A→D.

## Owner decisions before apply

1. Approve dry-run sales_mode assignment per SKU class
2. Confirm guest token TTL
3. Confirm whether PaymentLink `paid` overrides Medusa `not_paid` for buyer label (proposal: yes)
4. Customer action buttons now vs follow-up (proposal: follow-up; API ready)

## Status target

`ready_for_owner_review_no_deploy`
