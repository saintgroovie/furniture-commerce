# Native Medusa options evaluation (Night II)

Status: **evaluation only** - no migration in PR #193.

## What executions give today

Buyer-facing axes live in product `metadata` executions (`fabric_upholstery_executions`,
`finish_color_executions`, paint/wood matrices, Greenwich beds, etc.).

The storefront builds selectors from that metadata. Medusa still stores **one variant per
product** (157 published → 157 variants). Option title `Default` is a technical stub.

This model already supports:

- typed `semantic_type` / `presentation`
- evidenced color hex and explicit texture URLs
- material tiers and configured price multipliers without Cartesian variants
- media swap without inventing SKUs

## Real limits

1. Admin cannot edit buyer axes as first-class Medusa options.
2. Cart/line item may need execution metadata to explain the buyer choice.
3. Search/facets that only read Medusa options will not see executions.
4. The `Default` stub must stay hidden in every buyer surface.

## What a native option matrix would add

True Medusa options/variants would make Admin editing and inventory-per-combination easier
when combinations are commercially real SKUs.

## Migration risks

- Cartesian explosion (finish × fabric × size × material)
- Price/SKU drift vs today’s multiplier logic
- Broken display_group families that are intentionally separate products
- Irreversible catalog rewrite without a proven commercial need

## How many products would win now

Most of the 157 published products are **singleton** Medusa variants with optional
execution axes for media/price presentation. Only a minority have rich multi-axis
buyer choice, and those already work through executions.

## Cartesian risk

High if axes are naively multiplied. Current executions avoid inventing unavailable
combinations.

## Required before launch?

**No.** Buyer catalog can be served safely on the executions model after PR #193
normalization, provided:

- public titles stay clean
- swatches stay evidence-based
- `Default` never leaks to buyers
- import guards prevent pedestal-code / untyped-visual regressions

Revisit native options only with a scoped SKU commercial matrix and a rollback plan.
