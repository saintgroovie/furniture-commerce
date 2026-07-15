/**
 * Cart Kids grouping classifier fidelity (no Next runtime).
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/kids-cart-line.fidelity.test.ts
 *
 * Contract: explicit BESPOKE never joins the kids cart group, even when
 * kids line stamps or kids product metadata/collection fallbacks are present.
 * Missing / unknown classification is not treated as BESPOKE (same as
 * STANDARD/CONFIGURABLE kids paths when stamped or metadata-marked).
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

// Adult STANDARD (non-kids) → not kids
assert.equal(isKidsCartLineItem(line()), false)

// Adult CONFIGURABLE (non-kids) → not kids
assert.equal(
  isKidsCartLineItem(
    line({
      product: {
        id: "prod_cfg_adult",
        handle: "cfg-adult-1",
        product_classification: { product_type: "CONFIGURABLE" },
        metadata: {},
      },
    })
  ),
  false
)

// STANDARD kids via line stamp → kids
assert.equal(
  isKidsCartLineItem(
    line({ metadata: { storefront_section: "kids" } })
  ),
  true
)

// CONFIGURABLE kids via line stamp → kids
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: { storefront_section: "kids", cart_group: "kids" },
      product: {
        id: "prod_cfg_kids",
        handle: "cfg-kids-1",
        product_classification: { product_type: "CONFIGURABLE" },
        metadata: {},
      },
    })
  ),
  true
)

// STANDARD kids via product metadata (no line stamp) → kids
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: {},
      product: {
        id: "prod_std_kids_meta",
        handle: "std-kids-meta",
        product_classification: { product_type: "STANDARD" },
        metadata: { storefront_section: "kids" },
      },
    })
  ),
  true
)

// CONFIGURABLE kids via product metadata (no line stamp) → kids
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: {},
      product: {
        id: "prod_cfg_kids_meta",
        handle: "cfg-kids-meta",
        product_classification: { product_type: "CONFIGURABLE" },
        metadata: {
          storefront_section: "kids",
          collection: "willie-winkie",
        },
      },
    })
  ),
  true
)

// Explicit BESPOKE alone → not kids
assert.equal(
  isKidsCartLineItem(
    line({
      product: {
        id: "prod_bsp0",
        handle: "bespoke-0",
        product_classification: { product_type: "BESPOKE" },
        metadata: {},
      },
    })
  ),
  false
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

// BESPOKE + kids product metadata / collection fallback → still not kids
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

// Legacy productType BESPOKE + kids stamp → still not kids
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: { cart_group: "kids" },
      product: {
        id: "prod_bsp_legacy",
        handle: "bespoke-legacy",
        productType: { product_type: "BESPOKE" },
        metadata: { storefront_section: "kids" },
      },
    })
  ),
  false
)

// Missing classification + kids line stamp → kids (not treated as BESPOKE)
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: { storefront_section: "kids" },
      product: {
        id: "prod_missing_cls",
        handle: "missing-cls",
        metadata: {},
      },
    })
  ),
  true
)

// Missing classification, no kids signals → not kids
assert.equal(
  isKidsCartLineItem(
    line({
      product: {
        id: "prod_missing_cls2",
        handle: "missing-cls-2",
        metadata: {},
      },
    })
  ),
  false
)

// Unknown / malformed classification + kids stamp → kids (only explicit BESPOKE fails closed)
assert.equal(
  isKidsCartLineItem(
    line({
      metadata: { storefront_section: "kids" },
      product: {
        id: "prod_unknown_cls",
        handle: "unknown-cls",
        product_classification: { product_type: "NOT_A_REAL_TYPE" },
        metadata: {},
      },
    })
  ),
  true
)

// Unknown classification without kids signals → not kids
assert.equal(
  isKidsCartLineItem(
    line({
      product: {
        id: "prod_unknown_cls2",
        handle: "unknown-cls-2",
        product_classification: { product_type: "NOT_A_REAL_TYPE" },
        metadata: {},
      },
    })
  ),
  false
)

console.log("kids-cart-line.fidelity.test.ts: ok")
