# Launch A import readiness

**Generated:** 2026-06-15T17:04:53.281Z

## Operator approval

| Check | Status |
|-------|--------|
| Matrix operator-approved | yes (28/28) |
| CONFIGURABLE | 28/28 |
| configurable_tiers | 28/28 |
| draft | 28/28 |
| Workbook mapping | 28/28 |
| price_rub | 28/28 |
| CO-02-1 / AM-02-1 | absent |
| Tier prices TODO | 28/28 — **accepted** for Launch A |

## This draft package

| Artifact | Purpose |
|----------|---------|
| `launch-a-product-draft.json` | Request-mode product model (tmp) |
| `launch-a-request-mode-policy.json` | Launch A pricing/payment/tier policy |
| `launch-a-ui-copy.md` | Buyer-facing Russian copy |
| `launch-a-import-readiness.md` | This file |

## Not done (by design)

- Production `seed-products.json` — **not created**
- Seed command — **not run**
- Ingestion — **not run**
- DB mutation — **not run**
- Product-media apply — **not run**

## Next gated steps

1. **Buyer-facing launch audit** — PDP/cart copy + request CTA
2. **Request checkout audit** — form fields capture painting + material tier preference
3. **Catalog seed/import** — separate task using this draft as spec (not auto-import)
4. **Product-media apply** — after products exist in Medusa
5. **Post-launch P1** — full tier variants + prices when operator provides them
