import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  collectVariantIdsFromCartBody,
  decideCartClassification,
} from "./cart-classification-gate.ts"

describe("decideCartClassification", () => {
  it("allows STANDARD and CONFIGURABLE", () => {
    assert.deepEqual(
      decideCartClassification({ productFound: true, product_type: "STANDARD" }),
      { kind: "allow", product_type: "STANDARD" }
    )
    assert.deepEqual(
      decideCartClassification({
        productFound: true,
        product_type: "CONFIGURABLE",
      }),
      { kind: "allow", product_type: "CONFIGURABLE" }
    )
  })

  it("blocks BESPOKE", () => {
    assert.deepEqual(
      decideCartClassification({ productFound: true, product_type: "BESPOKE" }),
      { kind: "block_bespoke" }
    )
  })

  it("fails closed when product graph row is missing", () => {
    const out = decideCartClassification({ productFound: false })
    assert.equal(out.kind, "reject")
    if (out.kind === "reject") {
      assert.equal(out.code, "PRODUCT_TYPE_VALIDATION_FAILED")
      assert.equal(out.httpStatus, 500)
    }
  })

  it("fails closed when classification is missing or malformed", () => {
    for (const product_type of [undefined, null, "", "UNKNOWN", "standard"]) {
      const out = decideCartClassification({
        productFound: true,
        product_type,
      })
      assert.equal(out.kind, "reject")
      if (out.kind === "reject") {
        assert.equal(out.code, "PRODUCT_CLASSIFICATION_REQUIRED")
        assert.equal(out.httpStatus, 400)
      }
    }
  })
})

describe("collectVariantIdsFromCartBody", () => {
  it("reads variant_id and all items[].variant_id", () => {
    assert.deepEqual(
      collectVariantIdsFromCartBody({
        variant_id: "v1",
        items: [{ variant_id: "v2" }, { variant_id: "v1" }, {}],
      }),
      ["v1", "v2"]
    )
  })

  it("returns empty for unsupported bodies", () => {
    assert.deepEqual(collectVariantIdsFromCartBody(null), [])
    assert.deepEqual(collectVariantIdsFromCartBody({}), [])
  })
})
