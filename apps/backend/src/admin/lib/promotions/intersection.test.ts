import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { analyzeTargetIntersection } from "./intersection.ts"
import type { AdminPromotionDto } from "./types.ts"

function itemsPromo(
  id: string,
  rules: Array<{ attribute: string; operator: string; values: string[] }>
): AdminPromotionDto {
  return {
    id,
    type: "standard",
    code: id,
    application_method: {
      type: "percentage",
      value: 10,
      target_type: "items",
      target_rules: rules,
    },
  }
}

function orderPromo(id: string): AdminPromotionDto {
  return {
    id,
    type: "standard",
    code: id,
    application_method: { type: "percentage", value: 5, target_type: "order" },
  }
}

describe("analyzeTargetIntersection", () => {
  it("finds exact overlap for shared product ids", () => {
    const out = analyzeTargetIntersection(
      itemsPromo("a", [{ attribute: "items.product.id", operator: "in", values: ["p1", "p2"] }]),
      itemsPromo("b", [{ attribute: "items.product.id", operator: "in", values: ["p2", "p3"] }])
    )
    assert.equal(out.verdict, "exact_overlap")
    assert.match(out.explanation, /Общие товары/)
  })

  it("finds known non-overlap for disjoint product id lists", () => {
    const out = analyzeTargetIntersection(
      itemsPromo("a", [{ attribute: "items.product.id", operator: "in", values: ["p1"] }]),
      itemsPromo("b", [{ attribute: "items.product.id", operator: "in", values: ["p2"] }])
    )
    assert.equal(out.verdict, "no_overlap_known")
  })

  it("returns possible overlap when collections are involved", () => {
    const out = analyzeTargetIntersection(
      itemsPromo("a", [{ attribute: "items.product.id", operator: "in", values: ["p1"] }]),
      itemsPromo("b", [
        { attribute: "items.product.collection_id", operator: "in", values: ["c1"] },
      ])
    )
    assert.equal(out.verdict, "possible_overlap")
  })

  it("downgrades exact id math to possible when exclusions exist", () => {
    const out = analyzeTargetIntersection(
      itemsPromo("a", [
        { attribute: "items.product.id", operator: "in", values: ["p1"] },
        { attribute: "items.product.id", operator: "ne", values: ["p9"] },
      ]),
      itemsPromo("b", [{ attribute: "items.product.id", operator: "in", values: ["p1"] }])
    )
    assert.equal(out.verdict, "possible_overlap")
  })

  it("treats order-level promotions as overlapping item promotions", () => {
    const out = analyzeTargetIntersection(
      orderPromo("a"),
      itemsPromo("b", [{ attribute: "items.product.id", operator: "in", values: ["p1"] }])
    )
    assert.equal(out.verdict, "exact_overlap")
  })

  it("treats promotions without target rules as whole-catalog overlap", () => {
    const all: AdminPromotionDto = {
      id: "a",
      type: "standard",
      code: "ALL",
      application_method: { type: "percentage", value: 10, target_type: "items" },
    }
    const out = analyzeTargetIntersection(
      all,
      itemsPromo("b", [{ attribute: "items.product.id", operator: "in", values: ["p1"] }])
    )
    assert.equal(out.verdict, "exact_overlap")
  })

  it("returns unknown when either side has unsupported rules", () => {
    const out = analyzeTargetIntersection(
      itemsPromo("a", [{ attribute: "items.variant.id", operator: "in", values: ["v1"] }]),
      itemsPromo("b", [{ attribute: "items.product.id", operator: "in", values: ["p1"] }])
    )
    assert.equal(out.verdict, "unknown")
  })

  it("never claims a stacking result", () => {
    const out = analyzeTargetIntersection(
      itemsPromo("a", [{ attribute: "items.product.id", operator: "in", values: ["p1"] }]),
      itemsPromo("b", [{ attribute: "items.product.id", operator: "in", values: ["p1"] }])
    )
    assert.match(out.stacking_note, /не означает суммирование/)
    assert.ok(!/суммируются|сложатся/.test(out.explanation))
  })
})
