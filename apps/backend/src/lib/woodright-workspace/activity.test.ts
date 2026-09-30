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

  it("labels the first process event as opened, not a later change", () => {
    const items = projectOrderActivity({
      orderId: "order_4",
      createdAt: "2026-09-30T10:00:00.000Z",
      events: [
        {
          id: "evt_created",
          created_at: "2026-09-30T10:00:01.000Z",
          event_type: "created",
          next_stage: "new",
        },
      ],
    })
    assert.deepEqual(
      items.map((item) => item.label),
      ["Заказ создан", "Этап изготовления открыт"]
    )
  })

  it("does not pretend a note save is a stage change", () => {
    const items = projectOrderActivity({
      orderId: "order_3",
      events: [
        {
          id: "evt_note",
          created_at: "2026-09-30T12:00:00.000Z",
          event_type: "note_updated",
          next_stage: "in_production",
          internal_note: "Позвонили",
        },
      ],
    })
    assert.deepEqual(items.map((item) => item.kind), ["note"])
  })
})
