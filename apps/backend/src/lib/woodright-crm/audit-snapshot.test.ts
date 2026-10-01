import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { auditSnapshot } from "./audit-snapshot.ts"
import { crmAuditInsert } from "./record.ts"

describe("auditSnapshot", () => {
  it("keeps ids, including note_id, and drops note text, phone, and email", () => {
    const snap = auditSnapshot({
      customer_id: "cus_1",
      assignee_id: "user_1",
      match_status: "linked",
      note_id: "note_1",
      phone: "+7 900 000-00-01",
      email: "a@b.ru",
      summary: "Позвонить клиенту",
      body: "секретная заметка",
    })
    assert.deepEqual(snap, {
      customer_id: "cus_1",
      assignee_id: "user_1",
      match_status: "linked",
      note_id: "note_1",
    })
  })

  it("does not put the actor email into the audit insert", () => {
    const row = crmAuditInsert({
      actorId: "user_1",
      actorEmail: "seller@woodright.ru",
      entityType: "person",
      entityId: "lead_1",
      action: "person_note_added",
      after: { note_id: "note_1", email: "a@b.ru" },
    })
    assert.equal(row.actorEmail, null)
    assert.deepEqual(row.after, { note_id: "note_1" })
  })
})
