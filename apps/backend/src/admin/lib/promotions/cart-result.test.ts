import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { attributeCartAdjustments } from "./cart-result.ts"

describe("attributeCartAdjustments", () => {
  it("attributes a single coded adjustment", () => {
    const out = attributeCartAdjustments({
      cart: {
        items: [
          { id: "li_1", adjustments: [{ code: "SUMMER10", amount: 500 }] },
        ],
      },
      expected_codes: ["SUMMER10"],
    })
    assert.equal(out.verdict, "all_applied")
    assert.deepEqual(out.per_code, [
      { code: "SUMMER10", outcome: "applied", total_amount: 500, adjustment_count: 1 },
    ])
    assert.equal(out.unattributed_count, 0)
  })

  it("sums multiple adjustments for the same code across items", () => {
    const out = attributeCartAdjustments({
      cart: {
        items: [
          { id: "li_1", adjustments: [{ code: "SUMMER10", amount: 500 }] },
          { id: "li_2", adjustments: [{ code: "summer10", amount: 250 }] },
        ],
      },
      expected_codes: ["SUMMER10"],
    })
    assert.equal(out.verdict, "all_applied")
    assert.equal(out.per_code[0].total_amount, 750)
    assert.equal(out.per_code[0].adjustment_count, 2)
  })

  it("reports not applied when no adjustments exist", () => {
    const out = attributeCartAdjustments({
      cart: { items: [{ id: "li_1", adjustments: [] }] },
      expected_codes: ["SUMMER10"],
    })
    assert.equal(out.verdict, "none_applied")
    assert.equal(out.per_code[0].outcome, "not_applied")
    assert.equal(out.per_code[0].total_amount, null)
  })

  it("reports partial application for multiple codes", () => {
    const out = attributeCartAdjustments({
      cart: {
        items: [{ id: "li_1", adjustments: [{ code: "A", amount: 100 }] }],
      },
      expected_codes: ["A", "B"],
    })
    assert.equal(out.verdict, "partially_applied")
  })

  it("returns unknown for anonymous adjustments with multiple expected codes", () => {
    const out = attributeCartAdjustments({
      cart: {
        items: [
          { id: "li_1", adjustments: [{ amount: 100 }, { amount: 200 }] },
        ],
      },
      expected_codes: ["A", "B"],
    })
    assert.equal(out.verdict, "unknown")
    assert.match(out.explanation, /нельзя однозначно/)
  })

  it("returns unknown when anonymous and coded adjustments are mixed", () => {
    const out = attributeCartAdjustments({
      cart: {
        items: [
          { id: "li_1", adjustments: [{ code: "A", amount: 100 }, { amount: 50 }] },
        ],
      },
      expected_codes: ["A"],
    })
    assert.equal(out.verdict, "unknown")
  })

  it("counts foreign-code adjustments as unattributed but keeps honest success", () => {
    const out = attributeCartAdjustments({
      cart: {
        items: [
          {
            id: "li_1",
            adjustments: [
              { code: "A", amount: 100 },
              { code: "OTHER", amount: 30 },
            ],
          },
        ],
      },
      expected_codes: ["A"],
    })
    assert.equal(out.verdict, "all_applied")
    assert.equal(out.unattributed_count, 1)
    assert.equal(out.unattributed_amount, 30)
    assert.match(out.explanation, /другие скидки/)
  })

  it("includes shipping method adjustments", () => {
    const out = attributeCartAdjustments({
      cart: {
        shipping_methods: [
          { id: "sm_1", adjustments: [{ code: "SHIP", amount: 990 }] },
        ],
      },
      expected_codes: ["SHIP"],
    })
    assert.equal(out.verdict, "all_applied")
  })

  it("keeps total_amount null when an amount is unreadable", () => {
    const out = attributeCartAdjustments({
      cart: {
        items: [
          {
            id: "li_1",
            adjustments: [
              { code: "A", amount: 100 },
              { code: "A", amount: "not-a-number" },
            ],
          },
        ],
      },
      expected_codes: ["A"],
    })
    assert.equal(out.per_code[0].outcome, "applied")
    assert.equal(out.per_code[0].total_amount, null)
  })

  it("handles empty expected codes with discounts as unknown", () => {
    const out = attributeCartAdjustments({
      cart: { items: [{ id: "li_1", adjustments: [{ amount: 5 }] }] },
      expected_codes: [],
    })
    assert.equal(out.verdict, "unknown")
  })
})
