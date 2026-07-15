/**
 * Cart Kids grouping classifier fidelity (no Next runtime).
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/kids-cart-line.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { isKidsCartLineItem } from "./kids"

function line(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "item_1",
    metadata: {},
    product: {
      id: "prod_1",
      handle: "standard-1",
      product_classification: { product_type: "STANDARD" },
      metadata: {},
    },
    ...overrides,
  }
}

// Adult STANDARD → not kids
assert.equal(isKidsCartLineItem(line()), false)

// Line stamp kids → kids
assert.equal(
  isKidsCartLineItem(
    line({ metadata: { storefront_section: "kids" } })
  ),
  true
)

// Product metadata kids (no line stamp) → kids
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: {},
      product: {
        id: "prod_ww",
        handle: "av-05-1",
        product_classification: { product_type: "STANDARD" },
        metadata: {
          storefront_section: "kids",
          collection: "willie-winkie",
        },
      },
    })
  ),
  true
)

// BESPOKE + kids line stamp → still not kids (fail-closed)
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: { storefront_section: "kids", cart_group: "kids" },
      product: {
        id: "prod_bsp",
        handle: "bespoke-1",
        product_classification: { product_type: "BESPOKE" },
        metadata: { storefront_section: "kids" },
      },
    })
  ),
  false
)

// BESPOKE + kids product metadata only → still not kids
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: {},
      product: {
        id: "prod_bsp2",
        handle: "bespoke-2",
        product_classification: { product_type: "BESPOKE" },
        metadata: { storefront_section: "kids", collection: "willie-winkie" },
      },
    })
  ),
  false
)

console.log("kids-cart-line.fidelity.test.ts: ok")
