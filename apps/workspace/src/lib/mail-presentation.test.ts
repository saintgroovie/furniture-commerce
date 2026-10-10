import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { applySendResult, exactEmailCandidates, mailRowsToInbox, personBanner, todayMailThreads } from "./mail-presentation.ts"
import { NAV, visibleNav } from "./nav.ts"

describe("mail navigation", () => {
  it("keeps Входящие out of the shell until the backend allows them", () => {
    assert.equal(visibleNav(false), NAV)
    assert.equal(visibleNav(false).some((item) => item.href === "/inbox"), false)
    const ready = visibleNav(true)
    assert.equal(ready.some((item) => item.label === "Входящие"), true)
    assert.equal(ready.find((item) => item.id === "inbox")?.mobile, false)
    assert.ok(ready.filter((item) => item.mobile).length <= 4)
  })
})

describe("mail today and send", () => {
  it("drops indexed threads from Today while the mailbox is not usable", () => {
    const rows = [{ id: "t1", subject: "Стол", status: "open", waiting_on: "us", assignee_id: null, lead_id: null, request_id: null, order_id: null }]
    assert.deepEqual(todayMailThreads(false, rows), [])
    assert.equal(todayMailThreads(true, rows).length, 1)
  })

  it("does not add a thread that already has a request on Today", () => {
    const rows = mailRowsToInbox([
      { id: "t1", subject: "Стол", status: "open", waiting_on: "us", assignee_id: null, lead_id: "p1", request_id: "req_1", order_id: null },
      { id: "t2", subject: "Ткань", status: "open", waiting_on: "us", assignee_id: null, lead_id: null, request_id: null, order_id: null },
      { id: "t3", subject: "Ждём", status: "open", waiting_on: "client", assignee_id: null, lead_id: null, request_id: null, order_id: null },
    ])
    assert.deepEqual(rows.map((row) => row.id), ["mail:t2"])
  })

  it("keeps the draft when sending fails and clears it only after a real success", () => {
    assert.equal(applySendResult("добрый день", "sending").label, "Отправляем…")
    assert.equal(applySendResult("добрый день", "failed").draft, "добрый день")
    assert.equal(applySendResult("добрый день", "failed").label, "Письмо не отправлено.")
    assert.equal(applySendResult("добрый день", "sent").draft, "")
  })

  it("separates an unknown sender from several candidates", () => {
    assert.equal(personBanner({ leadId: null, candidateIds: [] }), "unresolved")
    assert.equal(personBanner({ leadId: null, candidateIds: ["a"] }), "suggested")
    assert.equal(personBanner({ leadId: null, candidateIds: ["a", "b"] }), "needs_review")
    assert.equal(personBanner({ leadId: "a", candidateIds: [] }), "linked")
    assert.deepEqual(
      exactEmailCandidates(
        [
          { id: "a", email: "Anna@x.ru" },
          { id: "b", email: "other@x.ru" },
        ],
        "anna@x.ru"
      ),
      ["a"]
    )
  })
})
