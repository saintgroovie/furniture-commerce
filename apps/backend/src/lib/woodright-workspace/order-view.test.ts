import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { joinOrdersWithProcesses, matchesOrderFilter } from "./order-view.ts"

describe("joinOrdersWithProcesses", () => {
  it("keeps Medusa payment separate from a missing manufacturing stage", () => {
    const [row] = joinOrdersWithProcesses(
      [
        {
          id: "order_1",
          display_id: 12,
          email: "a@x.ru",
          person_name: "Анна",
          phone: null,
          total: 120000,
          currency_code: "rub",
          payment_status: "captured",
          fulfillment_status: "not_fulfilled",
          created_at: "2026-09-30T10:00:00.000Z",
          medusa_status: "pending",
        },
      ],
      []
    )
    assert.equal(row.payment_status, "captured")
    assert.equal(row.manufacturing_stage, null)
    assert.equal(row.manufacturing_label, null)
    assert.equal(row.action_needed, false)
  })

  it("does not treat fulfillment as the manufacturing stage", () => {
    const [row] = joinOrdersWithProcesses(
      [
        {
          id: "order_2",
          display_id: 13,
          email: null,
          person_name: null,
          phone: null,
          total: null,
          currency_code: "rub",
          payment_status: "awaiting",
          fulfillment_status: "fulfilled",
          created_at: null,
          medusa_status: "completed",
        },
      ],
      [{ order_id: "order_2", current_stage: "in_production" }]
    )
    assert.equal(row.fulfillment_status, "fulfilled")
    assert.equal(row.manufacturing_stage, "in_production")
    assert.equal(matchesOrderFilter(row, "production"), true)
    assert.equal(matchesOrderFilter(row, "fulfilled"), true)
    assert.equal(matchesOrderFilter(row, "waiting"), false)
  })
})
