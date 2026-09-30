import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { projectOrderActivity } from "./activity.ts"

describe("projectOrderActivity", () => {
  it("uses only confirmed timestamps and notes", () => {
    const items = projectOrderActivity({
      orderId: "order_1",
      createdAt: "2026-09-30T10:00:00.000Z",
      events: [
        {
          id: "evt_1",
          created_at: "2026-09-30T11:00:00.000Z",
          next_stage: "in_production",
          internal_note: "Ждём ткань",
        },
      ],
    })
    assert.deepEqual(
      items.map((item) => item.kind),
      ["order_created", "stage_changed", "note"]
    )
    assert.equal(items.some((item) => item.label.toLowerCase().includes("оплат")), false)
  })

  it("returns nothing when history is absent", () => {
    assert.deepEqual(projectOrderActivity({ orderId: "order_2" }), [])
  })
})
