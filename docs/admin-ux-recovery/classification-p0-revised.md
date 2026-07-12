# Classification P0 — revised after rebase (2026-07-13)

## Finding

`public.product_type` on both `medusa-store` and `medusa-admin-ux-b5` is **Medusa core**
(`id`, `value`, `metadata`) — not Woodright.

Woodright types live in `product_classification` + link
`product_productextensionmodule_product_classificat7e368fb4`
(`product_classification_id`).

The earlier “copy rows from `product_type` → `product_classification`” assumption was wrong
and would corrupt core Medusa data.

## What PR #23 actually fixes

1. Code contract: `ProductClassification` / `product_classification` / `linkable.productClassification`
   (avoids joiner alias collision with Medusa core).
2. Forward migration `Migration20260711230213`: `CREATE TABLE IF NOT EXISTS product_classification`.
3. Consumers (Admin Workspace, store list, BESPOKE middleware) read `product_classification.*`.

## Not required

- SQL `INSERT … SELECT` from `public.product_type`
- Renaming/dropping core `product_type`
- `repair-b5-classifications.ts` as production migration

## Validation after rebase onto `main`

- No `model.define("product_type")` / `linkable.productType` in runtime code
- Graph fields request `product_classification.*` (not `productType.*`)
- Existing classification row/link counts preserved on b5
- BESPOKE cart middleware still uses `product_classification.product_type`
