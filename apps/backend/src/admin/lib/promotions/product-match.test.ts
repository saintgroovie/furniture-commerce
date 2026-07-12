import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { matchPromotionsForProduct } from "./product-match.ts"
import type { AdminPromotionDto } from "./types.ts"

function promo(
  id: string,
  rules: NonNullable<
    NonNullable<AdminPromotionDto["application_method"]>["target_rules"]
  >
): AdminPromotionDto {
  return {
    id,
    code: id,
    type: "standard",
    status: "active",
    is_automatic: false,
    application_method: {
      type: "percentage",
      value: 10,
      target_type: "items",
      allocation: "across",
      target_rules: rules,
    },
  }
}

describe("matchPromotionsForProduct", () => {
  it("matches direct product include", () => {
    const matches = matchPromotionsForProduct(
      [promo("p1", [{ attribute: "items.product.id", operator: "in", values: ["prod_A"] }])],
      "prod_A",
      null
    )
    assert.equal(matches.length, 1)
    assert.equal(matches[0].match, "direct")
  })

  it("matches indirect collection include", () => {
    const matches = matchPromotionsForProduct(
      [
        promo("p2", [
          {
            attribute: "items.product.collection_id",
            operator: "in",
            values: ["pcol_1"],
          },
        ]),
      ],
      "prod_A",
      "pcol_1"
    )
    assert.equal(matches[0].match, "indirect")
  })

  it("does not claim apply when collection include + product exclude", () => {
    const matches = matchPromotionsForProduct(
      [
        promo("p3", [
          {
            attribute: "items.product.collection_id",
            operator: "in",
            values: ["pcol_1"],
          },
          { attribute: "items.product.id", operator: "ne", values: ["prod_A"] },
        ]),
      ],
      "prod_A",
      "pcol_1"
    )
    assert.equal(matches.length, 1)
    assert.equal(matches[0].match, "needs_cart_check")
  })

  it("skips promotions that only exclude the product", () => {
    const matches = matchPromotionsForProduct(
      [promo("p4", [{ attribute: "items.product.id", operator: "ne", values: ["prod_A"] }])],
      "prod_A",
      null
    )
    assert.equal(matches.length, 0)
  })
})
