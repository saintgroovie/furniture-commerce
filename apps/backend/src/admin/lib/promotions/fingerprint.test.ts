import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildPromotionFingerprint, checkPromotionStale } from "./fingerprint.ts"
import type { AdminPromotionDto } from "./types.ts"

function promo(overrides?: Partial<AdminPromotionDto>): AdminPromotionDto {
  return {
    id: "promo_1",
    code: "SUMMER10",
    status: "draft",
    type: "standard",
    updated_at: "2026-07-12T10:00:00.000Z",
    application_method: {
      type: "percentage",
      value: 10,
      target_type: "items",
      allocation: "across",
      target_rules: [
        { attribute: "items.product.id", operator: "in", values: ["p1", "p2"] },
      ],
    },
    ...overrides,
  }
}

describe("buildPromotionFingerprint", () => {
  it("is stable for identical promotions", () => {
    assert.equal(buildPromotionFingerprint(promo()), buildPromotionFingerprint(promo()))
  })

  it("ignores rule and value ordering", () => {
    const a = promo({
      application_method: {
        type: "percentage",
        value: 10,
        target_type: "items",
        allocation: "across",
        target_rules: [
          { attribute: "items.product.id", operator: "in", values: ["p2", "p1"] },
          { attribute: "items.product.collection_id", operator: "in", values: ["c1"] },
        ],
      },
    })
    const b = promo({
      application_method: {
        type: "percentage",
        value: 10,
        target_type: "items",
        allocation: "across",
        target_rules: [
          { attribute: "items.product.collection_id", operator: "in", values: ["c1"] },
          { attribute: "items.product.id", operator: "in", values: ["p1", "p2"] },
        ],
      },
    })
    assert.equal(buildPromotionFingerprint(a), buildPromotionFingerprint(b))
  })

  it("changes when the discount value changes", () => {
    const a = buildPromotionFingerprint(promo())
    const b = buildPromotionFingerprint(
      promo({
        application_method: {
          type: "percentage",
          value: 15,
          target_type: "items",
          allocation: "across",
          target_rules: [
            { attribute: "items.product.id", operator: "in", values: ["p1", "p2"] },
          ],
        },
      })
    )
    assert.notEqual(a, b)
  })

  it("changes when updated_at changes", () => {
    const a = buildPromotionFingerprint(promo())
    const b = buildPromotionFingerprint(promo({ updated_at: "2026-07-12T11:00:00.000Z" }))
    assert.notEqual(a, b)
  })

  it("changes when status changes", () => {
    const a = buildPromotionFingerprint(promo())
    const b = buildPromotionFingerprint(promo({ status: "active" }))
    assert.notEqual(a, b)
  })
})

describe("checkPromotionStale", () => {
  it("passes when nothing changed", () => {
    const original = buildPromotionFingerprint(promo())
    assert.deepEqual(checkPromotionStale(original, promo()), { stale: false })
  })

  it("blocks the save with a Russian reason when the promotion changed", () => {
    const original = buildPromotionFingerprint(promo())
    const out = checkPromotionStale(original, promo({ code: "WINTER20" }))
    assert.equal(out.stale, true)
    if (out.stale) {
      assert.match(out.reason, /обновите страницу/i)
    }
  })
})
