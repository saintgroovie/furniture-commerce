import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { noteActivity } from "./activity.ts"
import { collectIdentityCandidates, planDeskPerson } from "./create-person.ts"

describe("desk person create", () => {
  const existing = [{ id: "lead_1", email: "Anna@Example.com", phone: "+7 900 000-00-01" }]

  it("requires a name and does not merge an exact match", () => {
    assert.equal(planDeskPerson({ name: "  ", existing, confirm: false }).action, "need_name")
    const warned = planDeskPerson({ name: "Анна", email: "anna@example.com", existing, confirm: false })
    assert.equal(warned.action, "confirm_existing")
    if (warned.action === "confirm_existing") assert.deepEqual(warned.ids, ["lead_1"])
  })

  it("keeps paging until an exact match past the first 500 is visible", async () => {
    const page = await collectIdentityCandidates(async (skip, take) => {
      const total = 650
      if (skip >= total) return []
      return Array.from({ length: Math.min(take, total - skip) }, (_, index) => {
        const n = skip + index
        return { id: `lead_${n}`, email: n === 620 ? "late@example.com" : `other-${n}@example.com`, phone: null }
      })
    })
    assert.equal(page.complete, true)
    assert.equal(page.candidates.length, 650)
    const warned = planDeskPerson({ name: "Поздний", email: "late@example.com", existing: page.candidates, confirm: false })
    assert.equal(warned.action, "confirm_existing")
  })

  it("does not create when the lookup hits the cap and the employee has not confirmed", async () => {
    const page = await collectIdentityCandidates(async (skip, take) => {
      return Array.from({ length: take }, (_, index) => ({ id: `lead_${skip + index}`, email: null, phone: null }))
    })
    assert.equal(page.complete, false)
    assert.equal(page.candidates.length, 20000)
    assert.equal(planDeskPerson({ name: "Ещё", existing: page.candidates, confirm: false, lookupComplete: false }).action, "lookup_incomplete")
    assert.equal(planDeskPerson({ name: "Ещё", existing: page.candidates, confirm: true, lookupComplete: false }).action, "create")
  })

  it("creates when the employee confirms or the contact is new", () => {
    assert.equal(planDeskPerson({ name: "Анна", email: "anna@example.com", existing, confirm: true }).action, "create")
    assert.equal(planDeskPerson({ name: "Борис", phone: "+7 900 111-22-33", existing, confirm: false }).action, "create")
  })
})

describe("note versus contact", () => {
  it("keeps an internal note distinct from a logged call", () => {
    const note = noteActivity({ id: "n1", body: "Внутренняя пометка", kind: "note", created_at: "2026-10-02T00:00:00.000Z" })
    const call = noteActivity({ id: "n2", body: "Договорились", kind: "call", created_at: "2026-10-02T00:00:00.000Z" })
    assert.equal(note.source, "note")
    assert.equal(note.text, "Внутренняя пометка")
    assert.equal(call.source, "contact")
    assert.equal(call.text, "Звонок. Договорились")
  })
})
