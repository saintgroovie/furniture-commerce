import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildImpactEstimate } from "./impact.ts"
import type { AdminPromotionDto } from "./types.ts"

function promo(overrides: Partial<AdminPromotionDto>): AdminPromotionDto {
  return { id: "promo_1", type: "standard", code: "X", ...overrides }
}

describe("buildImpactEstimate", () => {
  it("reports whole-order impact for order target", () => {
    const out = buildImpactEstimate(
      promo({ application_method: { type: "percentage", value: 5, target_type: "order" } })
    )
    assert.equal(out.confidence, "whole_order")
    assert.match(out.headline, /итог заказа/)
  })

  it("counts unique product ids as an upper bound", () => {
    const out = buildImpactEstimate(
      promo({
        application_method: {
          type: "percentage",
          value: 10,
          target_type: "items",
          target_rules: [
            { attribute: "items.product.id", operator: "in", values: ["p1", "p2", "p2", "p3"] },
          ],
        },
      })
    )
    assert.equal(out.confidence, "exact_list")
    assert.match(out.headline, /до 3 товаров/)
  })

  it("uses singular wording for one product", () => {
    const out = buildImpactEstimate(
      promo({
        application_method: {
          type: "percentage",
          value: 10,
          target_type: "items",
          target_rules: [{ attribute: "items.product.id", operator: "in", values: ["p1"] }],
        },
      })
    )
    assert.match(out.headline, /до 1 товара/)
  })

  it("declares catalog dependence for collection scope", () => {
    const out = buildImpactEstimate(
      promo({
        application_method: {
          type: "percentage",
          value: 10,
          target_type: "items",
          target_rules: [
            { attribute: "items.product.collection_id", operator: "in", values: ["c1"] },
          ],
        },
      })
    )
    assert.equal(out.confidence, "depends_on_catalog")
    assert.ok(!/до \d+/.test(out.headline))
  })

  it("treats no target rules as whole-catalog", () => {
    const out = buildImpactEstimate(
      promo({
        application_method: { type: "percentage", value: 10, target_type: "items" },
      })
    )
    assert.equal(out.confidence, "depends_on_catalog")
    assert.match(out.headline, /все товары/)
  })

  it("is honest about exclusions shrinking the estimate", () => {
    const out = buildImpactEstimate(
      promo({
        application_method: {
          type: "percentage",
          value: 10,
          target_type: "items",
          target_rules: [
            { attribute: "items.product.id", operator: "in", values: ["p1", "p2"] },
            { attribute: "items.product.id", operator: "ne", values: ["p2"] },
          ],
        },
      })
    )
    assert.equal(out.confidence, "exact_list")
    assert.ok(out.notes.some((n) => /исключен/i.test(n)))
  })

  it("returns unknown when rules are unsupported", () => {
    const out = buildImpactEstimate(
      promo({
        application_method: {
          type: "percentage",
          value: 10,
          target_type: "items",
          target_rules: [{ attribute: "items.variant.id", operator: "in", values: ["v1"] }],
        },
      })
    )
    assert.equal(out.confidence, "unknown")
    assert.match(out.headline, /нельзя/)
  })

  it("adds base-price honesty note for fixed discounts", () => {
    const out = buildImpactEstimate(
      promo({
        application_method: {
          type: "fixed",
          value: 3000,
          currency_code: "rub",
          target_type: "order",
        },
      })
    )
    assert.ok(out.notes.some((n) => /не меняет базовые цены/.test(n)))
  })

  it("always flags the estimate as preliminary", () => {
    const out = buildImpactEstimate(
      promo({
        application_method: { type: "percentage", value: 5, target_type: "order" },
      })
    )
    assert.ok(out.notes.some((n) => /предварительная/i.test(n)))
  })
})
