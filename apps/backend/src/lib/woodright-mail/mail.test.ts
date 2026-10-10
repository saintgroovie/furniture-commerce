import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideInbox } from "./inbox-state.ts"
import { threadParentId } from "./threading.ts"
import { deliveryUniqueKey, isSameDelivery } from "./dedup.ts"
import { nextRetryDelayMs, planSync } from "./sync.ts"
import { ingestHeaders, suggestOrder, visibleCompany } from "./ingest.ts"
import { closeThreadPlan, deliverStaffText, seenPlan } from "./reply.ts"
import { filterThreads, mailTodayItems, threadListFilters, threadRecency } from "./inbox-state.ts"
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
    const down = createTestConnector({ state: "error", failure: "provider_unavailable" })
    assert.equal(down.connectionState(), "error")
    await assert.rejects(() => down.listHeaders({ folder: "INBOX", fromUid: 0 }), (error: unknown) => error instanceof MailConnectorError && error.failure === "provider_unavailable")
    await down.reconnect()
    assert.equal(down.connectionState(), "configured")
    const empty = createTestConnector({ body: null, attachment: "missing" })
    assert.equal((await empty.fetchBody("1")).available, false)
    assert.equal((await empty.loadAttachment("file-1")).available, false)
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

  it("keeps an unknown sender unresolved, not a Medusa customer and not a new person", () => {
    const plan = matchSenderAddress(people, "new@x.ru")
    assert.deepEqual(plan, { action: "unresolved" })
    assert.equal("customer_id" in plan, false)
  })
})

describe("ingest", () => {
  const base = {
    provider: "yandex",
    mailbox: "desk@woodright.ru",
    folder: "INBOX",
    uidValidity: "7",
    people: [
      { id: "lead_1", email: "Anna@x.ru" },
      { id: "lead_2", email: "other@x.ru" },
    ],
  }
  const header = {
    uid: "4",
    messageId: "<a@woodright.ru>",
    inReplyTo: null as string | null,
    references: [] as string[],
    subject: "Стол",
    from: "anna@x.ru",
    to: ["desk@woodright.ru"],
    occurredAt: "2026-10-01T12:00:00.000Z",
  }

  it("indexes one delivery and skips the same message when Sent is scanned later", () => {
    const first = ingestHeaders({ ...base, checkpoint: null, headers: [header], known: [] })
    assert.equal(first.created.length, 1)
    assert.equal(first.created[0]?.contentState, "metadata_only")
    assert.equal(first.created[0]?.senderPlan.action, "link_thread")
    assert.equal(first.checkpoint.lastUid, 4)
    const second = ingestHeaders({
      ...base,
      folder: "Sent",
      checkpoint: { folder: "Sent", uidValidity: "7", lastUid: 0 },
      headers: [{ ...header, uid: "9" }],
      known: [{
        threadId: first.created[0]!.threadId,
        rfcMessageId: "<a@woodright.ru>",
        identity: {
          provider: "yandex",
          mailbox: "desk@woodright.ru",
          folder: "INBOX",
          uid: "4",
          uidValidity: "7",
          messageId: "<a@woodright.ru>",
        },
      }],
    })
    assert.equal(second.created.length, 0)
  })

  it("joins a reply and does not join two subjects that both say Заказ", () => {
    const first = ingestHeaders({ ...base, checkpoint: null, headers: [header], known: [] })
    const reply = ingestHeaders({
      ...base,
      checkpoint: first.checkpoint,
      headers: [{
        ...header,
        uid: "5",
        messageId: "<b@woodright.ru>",
        inReplyTo: "<a@woodright.ru>",
        subject: "Re: Заказ",
        from: "new@x.ru",
      }],
      known: [{
        threadId: first.created[0]!.threadId,
        rfcMessageId: "<a@woodright.ru>",
        identity: {
          provider: "yandex",
          mailbox: "desk@woodright.ru",
          folder: "INBOX",
          uid: "4",
          uidValidity: "7",
          messageId: "<a@woodright.ru>",
        },
      }],
    })
    assert.equal(reply.created.length, 1)
    assert.equal(reply.created[0]?.threadId, first.created[0]?.threadId)
    assert.equal(reply.created[0]?.newThread, false)
    assert.equal(reply.created[0]?.senderPlan.action, "unresolved")
    const other = ingestHeaders({
      ...base,
      checkpoint: reply.checkpoint,
      headers: [{ ...header, uid: "6", messageId: "<c@woodright.ru>", subject: "Re: Заказ", from: "other@x.ru" }],
      known: [],
    })
    assert.equal(other.created[0]?.newThread, true)
    assert.equal(suggestOrder("Re: Заказ"), null)
    assert.equal(suggestOrder("Заказ № 1042"), "Заказ № 1042")
    assert.equal(other.created[0]?.orderSuggestion, null)
  })

  it("does not auto-link a company when the person match is ambiguous", () => {
    assert.equal(visibleCompany({ plan: { action: "needs_review", lead_ids: ["a", "b"] }, companyIds: ["c1"] }), null)
    assert.equal(visibleCompany({ plan: { action: "link_thread", lead_id: "a" }, companyIds: ["c1", "c2"] }), null)
    assert.equal(visibleCompany({ plan: { action: "link_thread", lead_id: "a" }, companyIds: ["c1"] }), "c1")
  })
})

describe("staff text", () => {
  it("keeps a note off the connector, retains a rejected draft, and does not send twice", async () => {
    const connector = createTestConnector({})
    const note = await deliverStaffText({
      kind: "note",
      text: "внутреннее",
      threadId: "t",
      alreadyAcceptedId: null,
      connector,
    })
    assert.equal(note.called, false)
    assert.equal(note.delivery.state, "internal")
    const rejected = createTestConnector({ failure: "smtp_rejected" })
    const failed = await deliverStaffText({
      kind: "reply",
      text: "добрый день",
      threadId: "t",
      alreadyAcceptedId: null,
      connector: rejected,
    })
    assert.equal(failed.delivery.state, "rejected")
    if (failed.delivery.state === "rejected") assert.equal(failed.delivery.draft, "добрый день")
    const hung = createTestConnector({ failure: "timeout" })
    const uncertain = await deliverStaffText({
      kind: "reply",
      text: "ещё раз",
      threadId: "t",
      alreadyAcceptedId: null,
      connector: hung,
    })
    assert.equal(uncertain.delivery.state, "uncertain")
    const again = await deliverStaffText({
      kind: "reply",
      text: "ещё раз",
      threadId: "t",
      alreadyAcceptedId: "sim-1",
      connector,
    })
    assert.equal(again.called, false)
    assert.equal(again.delivery.state, "sent")
    assert.equal(connector.calls.includes("sendReply"), false)
  })

  it("does not delete provider mail when a thread is closed, and does not touch IMAP flags", () => {
    assert.equal(closeThreadPlan().providerDelete, false)
    assert.equal(closeThreadPlan().providerMove, false)
    assert.equal(seenPlan().imapFlags, "unchanged")
  })
})

describe("inbox query", () => {
  const rows = [
    { id: "1", status: "open", waiting_on: "us", assignee_id: null, request_id: "req_1", subject: "Стол", sender: "Анна" },
    { id: "2", status: "open", waiting_on: "client", assignee_id: "user_1", request_id: null, subject: "Ждём", sender: "Борис" },
    { id: "3", status: "closed", waiting_on: "nobody", assignee_id: "user_1", request_id: null, subject: "Архив", sender: "Анна" },
  ]

  it("splits requires-reply, mine, unassigned, waiting and closed", () => {
    assert.deepEqual(filterThreads(rows, "needs_reply", "user_1").map((row) => row.id), ["1"])
    assert.deepEqual(filterThreads(rows, "mine", "user_1").map((row) => row.id), ["2"])
    assert.deepEqual(filterThreads(rows, "unassigned", "user_1").map((row) => row.id), ["1"])
    assert.deepEqual(filterThreads(rows, "waiting", "user_1").map((row) => row.id), ["2"])
    assert.deepEqual(filterThreads(rows, "closed", "user_1").map((row) => row.id), ["3"])
  })

  it("asks the database for the view before any limit", () => {
    assert.deepEqual(threadListFilters("needs_reply", "user_1"), [{ status: "open", waiting_on: "us" }])
    assert.deepEqual(threadListFilters("mine", null), [])
    assert.deepEqual(threadListFilters("unassigned", null), [
      { status: "open", assignee_id: null },
      { status: "waiting", assignee_id: null },
    ])
    assert.equal(threadListFilters("closed", "user_1").some((filter) => filter.status === "open"), false)
    const older = new Date("2026-01-01T00:00:00.000Z")
    const newer = new Date("2026-10-01T00:00:00.000Z")
    assert.ok(threadRecency(newer) > threadRecency(older))
    assert.equal(threadRecency(newer), "2026-10-01T00:00:00.000Z")
  })

  it("adds only an actionable thread and skips one already shown as its request", () => {
    const items = mailTodayItems(rows, ["/requests/req_1"])
    assert.deepEqual(items.map((item) => item.id), [])
    const fresh = mailTodayItems([{ ...rows[0]!, request_id: null }], ["/requests/req_1"])
    assert.equal(fresh[0]?.href, "/inbox/1")
  })
})

describe("retry", () => {
  it("backs off without growing forever", () => {
    assert.equal(nextRetryDelayMs(1), 1000)
    assert.equal(nextRetryDelayMs(2), 2000)
    assert.equal(nextRetryDelayMs(20), 300_000)
  })
})
