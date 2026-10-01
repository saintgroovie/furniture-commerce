import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { auditActionText, manufacturingText, projectActivity } from "./activity.ts"

describe("activity projection", () => {
  it("sorts newest first and drops empty lines", () => {
    const lines = projectActivity([
      { id: "1", at: "2026-10-01T00:00:00.000Z", source: "request", text: "Заявка" },
      { id: "2", at: "2026-10-02T00:00:00.000Z", source: "note", text: "Позвонили" },
      { id: "3", at: "2026-10-03T00:00:00.000Z", source: "audit", text: "   " },
    ])
    assert.deepEqual(lines.map((line) => line.id), ["2", "1"])
  })

  it("labels audit actions without reading a payload", () => {
    assert.equal(auditActionText("customer_linked"), "Покупатель магазина связан")
    assert.equal(auditActionText("unknown_action"), "Изменение")
    assert.equal(manufacturingText("note_updated"), "Заметка по заказу")
    assert.equal(manufacturingText("stage_changed"), "Этап заказа")
  })
})
