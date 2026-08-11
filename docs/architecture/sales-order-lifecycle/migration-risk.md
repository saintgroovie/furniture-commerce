# Migration risk

## Risks

1. **No auto sales_mode backfill** — assigning modes without owner dry-run can break CTA/cart.
2. **BespokeRequest.status collision** — operators may confuse CRM status with order process; keep separate.
3. **Guest token at checkout** — if subscriber fails, order exists without process; must be recoverable (admin create / on-read ensure).
4. **Admin SDK widgets first time in this tree** — verify zone names against 2.17.2; fallback Admin route `Производство`.
5. **Payment/fulfillment derived labels** — current MVP uses `pp_system_default`; buyer payment labels must also consider PaymentLink when linked to order.

## Safe plan

1. Additive modules only (`product_sales_policy`, `woodright_order_process`, events).
2. Default runtime compatibility: missing sales_mode → derive buyer contract from ProductClassification **without writing DB**.
3. Keep BESPOKE cart gate fail-closed.
4. Dry-run script for proposed STANDARD→made_to_order etc. — **no apply**.
5. Local DB only for migrate/tests.
