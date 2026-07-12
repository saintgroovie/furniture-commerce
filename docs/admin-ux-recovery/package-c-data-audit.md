# Package C — data audit (isolated `medusa-admin-ux-b5`)

**Date:** 2026-07-12 (MSK)
**Scope:** isolated fixture DB only. No shared DB reads/writes for mutation.

## Counts

| Entity | Count |
|--------|------:|
| Products | 8 |
| Variants | 8 |
| Options | 8 |
| Prices | 7 |

## B5 fixtures (handles)

All current B5 products have **exactly one** variant (Default option).

| Handle | Variants | Missing SKU | Notes |
|--------|---------:|------------:|-------|
| b5-standard-chair | 1 | 0 | STANDARD, price 12500 rub |
| b5-configurable-table | 1 | 0 | CONFIGURABLE, still Default option in seed |
| b5-bespoke-kitchen | 1 | 0 | BESPOKE |
| b5-missing-type | 1 | 0 | no classification |
| b5-no-price | 1 | 0 | no price row |
| b5-no-thumbnail | 1 | 0 | |
| b5-draft-product | 1 | 0 | draft |
| b5-large-gallery | 1 | 0 | 96 images |

## Gaps for Package C QA

Current fixtures lack:

- multi-option CONFIGURABLE matrix;
- duplicate SKU within product;
- multi-currency on one variant;
- rule-based / min-qty prices;
- 50+ variants.

**Plan:** add isolated-only seed script `seed-package-c-fixtures.ts` for CONFIGURABLE multi-option product + edge cases. Unit/component tests cover 50+ synthetic rows without DB.

## Currencies observed

- `rub` only in priced fixtures.

## Complex prices

None in current B5 set (`rules: {}`, null min/max).
