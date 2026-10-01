import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideInbox } from "./inbox-state.ts"
import { threadParentId } from "./threading.ts"
import { deliveryUniqueKey, isSameDelivery } from "./dedup.ts"
import { planSync } from "./sync.ts"
import { createTestConnector } from "./test-connector.ts"
import { matchSenderAddress } from "./match-sender.ts"
import { MailConnectorError } from "./connector.ts"

const header = {
  uid: "4",
  messageId: "<a@woodright.ru>",
  inReplyTo: null,
  references: [],
  subject: "Стол",
  from: "anna@x.ru",
  occurredAt: "2026-10-01T12:00:00.000Z",
}

describe("inbox visibility", () => {
  it("stays hidden unless connection, permission, and the live connector all say yes", () => {
    assert.equal(decideInbox({ connectionStatus: null, permitted: true, liveConnector: true }).visible, false)
    assert.equal(decideInbox({ connectionStatus: "configured", permitted: false, liveConnector: true }).reason, "not_permitted")
    assert.equal(decideInbox({ connectionStatus: "configured", permitted: true, liveConnector: false }).reason, "connector_disabled")
    assert.equal(decideInbox({ connectionStatus: "configured", permitted: true, liveConnector: true }).visible, true)
  })
})

describe("threading and dedup", () => {
  it("joins a reply by In-Reply-To and ignores a shared subject", () => {
    const known = new Set(["<a@woodright.ru>"])
    assert.equal(threadParentId({ messageId: "<b@woodright.ru>", inReplyTo: "<a@woodright.ru>", references: [] }, known), "<a@woodright.ru>")
    assert.equal(threadParentId({ messageId: "<d@woodright.ru>", inReplyTo: null, references: ["<missing@x>", "<a@woodright.ru>"] }, known), "<a@woodright.ru>")
    assert.equal(threadParentId({ messageId: "<c@woodright.ru>", inReplyTo: null, references: [] }, known), null)
  })

  it("treats the same Message-ID in one mailbox as one delivery, even in another folder", () => {
    const a = { provider: "yandex", mailbox: "desk@woodright.ru", folder: "INBOX", uid: "1", uidValidity: "7", messageId: "<a@woodright.ru>" }
    const moved = { ...a, folder: "Archive", uid: "9" }
    const otherBox = { ...a, mailbox: "other@woodright.ru" }
    const reusedUid = { ...a, messageId: null, uidValidity: "8" }
    assert.equal(isSameDelivery(a, moved), true)
    assert.equal(isSameDelivery(a, otherBox), false)
    assert.equal(isSameDelivery({ ...a, messageId: null }, reusedUid), false)
    assert.equal(deliveryUniqueKey(a), deliveryUniqueKey(moved))
    assert.notEqual(deliveryUniqueKey(a), deliveryUniqueKey(otherBox))
    assert.notEqual(deliveryUniqueKey({ ...a, messageId: null }), deliveryUniqueKey(reusedUid))
  })

  it("resets the checkpoint when UIDVALIDITY changes", () => {
    assert.deepEqual(planSync({ checkpoint: { folder: "INBOX", uidValidity: "1", lastUid: 40 }, folder: "INBOX", uidValidity: "2" }), { mode: "resync", fromUid: 0 })
    assert.deepEqual(planSync({ checkpoint: { folder: "INBOX", uidValidity: "1", lastUid: 40 }, folder: "INBOX", uidValidity: "1" }), { mode: "incremental", fromUid: 40 })
  })
})

describe("test connector", () => {
  it("covers token, timeout, duplicate, reconnect, smtp reject, and a simulated send", async () => {
    for (const failure of ["token_unavailable", "token_expired", "token_revoked", "timeout"] as const) {
      const connector = createTestConnector({ failure, headers: [header] })
      await assert.rejects(() => connector.listHeaders({ folder: "INBOX", fromUid: 0 }), (error: unknown) => error instanceof MailConnectorError && error.failure === failure)
    }
    const dup = createTestConnector({ headers: [header, header] })
    const listed = await dup.listHeaders({ folder: "INBOX", fromUid: 1 })
    assert.equal(listed.length, 2)
    const rejected = createTestConnector({ failure: "smtp_rejected" })
    assert.deepEqual(await rejected.sendReply({ threadId: "t", text: "ok" }), { ok: false, failure: "smtp_rejected" })
    const sent = createTestConnector({})
    assert.equal((await sent.sendReply({ threadId: "t", text: "ok" })).ok, true)
    const down = createTestConnector({ state: "error" })
    assert.equal(down.connectionState(), "error")
    await down.reconnect()
    assert.equal(down.connectionState(), "configured")
  })
})

describe("incoming sender", () => {
  const people = [
    { id: "lead_1", email: "Anna@x.ru" },
    { id: "lead_2", email: "other@x.ru" },
  ]

  it("links a thread to the one exact address and does not create a customer", () => {
    assert.deepEqual(matchSenderAddress(people, "anna@x.ru"), { action: "link_thread", lead_id: "lead_1" })
  })

  it("holds several candidates for review", () => {
    const plan = matchSenderAddress([{ id: "a", email: "anna@x.ru" }, { id: "b", email: "anna@x.ru" }], "anna@x.ru")
    assert.equal(plan.action, "needs_review")
  })

  it("keeps an unknown sender as a future contact, not a Medusa customer", () => {
    const plan = matchSenderAddress(people, "new@x.ru")
    assert.deepEqual(plan, { action: "create_contact" })
    assert.equal("customer_id" in plan, false)
  })
})
