# Migration plan

## Additive only

1. Register modules: `product-sales`, `order-process` (+ access token model inside order-process).
2. Module links: Product ↔ ProductSalesPolicy.
3. Generate migrations locally via Medusa CLI when DB available; commit migration files if generated.
4. No live/prod migrate in this cycle.

## Sales mode data

- **No** automatic UPDATE of catalog.
- Provide `scripts/dry-run-sales-mode-proposal.ts` output JSON for owner.
- Proposal mapping: STANDARD→made_to_order, CONFIGURABLE→configurable_to_order, BESPOKE→bespoke_project.
- Until overrides exist, runtime compat projection only.

## Order backfill

- New orders only via subscriber.
- Optional admin “ensure process” for historical orders (lazy on Admin open) — no mass backfill.

## Rollback

- Feature flags not required if unused UI; modules additive.
- Removing widgets leaves core Medusa intact.
