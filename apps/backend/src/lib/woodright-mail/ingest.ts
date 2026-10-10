import { deliveryUniqueKey, type MailIdentity } from "./dedup"
import { matchSenderAddress, type IncomingPlan } from "./match-sender"
import { planSync, type SyncCheckpoint } from "./sync"
import { threadParentId } from "./threading"

export type InboundHeader = {
  uid: string
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  subject: string | null
  from: string
  to: string[]
  occurredAt: string
  attachments?: Array<{ filename: string | null; mime: string | null; size: number | null; providerRef: string | null }>
}

export type KnownDelivery = {
  threadId: string
  rfcMessageId: string | null
  identity: MailIdentity
}

export type IngestedMessage = {
  uniqueKey: string
  threadId: string
  newThread: boolean
  subject: string | null
  sender: string
  recipients: string[]
  occurredAt: string
  folder: string
  uid: string
  uidValidity: string
  rfcMessageId: string | null
  inReplyTo: string | null
  references: string[]
  direction: "inbound"
  contentState: "metadata_only"
  senderPlan: IncomingPlan
  /** Display only. Never written as order_id. */
  orderSuggestion: string | null
  attachments: Array<{ filename: string | null; mime: string | null; size: number | null; providerRef: string | null }>
}

const ORDER_TOKEN = /\border_[0-9A-Z]{10,}\b/
const ORDER_LABEL = /заказ\s*№\s*(\d{2,})/i

/** A shared subject such as "Re: Заказ" is not an order link. */
export function suggestOrder(subject: string | null): string | null {
  if (!subject) return null
  const id = subject.match(ORDER_TOKEN)
  if (id) return id[0]
  const label = subject.match(ORDER_LABEL)
  if (label) return label[0]
  return null
}

/**
 * One exact person can be shown with their single company.
 * The thread row itself is not given a company_id here.
 */
export function visibleCompany(input: { plan: IncomingPlan; companyIds: string[] }): string | null {
  if (input.plan.action !== "link_thread") return null
  if (input.companyIds.length !== 1) return null
  return input.companyIds[0] ?? null
}

function uidNumber(uid: string): number | null {
  if (!/^[0-9]+$/.test(uid)) return null
  const value = Number(uid)
  return Number.isSafeInteger(value) ? value : null
}

/**
 * Incremental index. Bodies are not copied. A second delivery of the same
 * mailbox Message-ID, including a later Sent-folder copy, is one row.
 */
export function ingestHeaders(input: {
  provider: string
  mailbox: string
  folder: string
  uidValidity: string
  checkpoint: SyncCheckpoint | null
  headers: InboundHeader[]
  known: KnownDelivery[]
  people: Array<{ id: string; email?: string | null }>
}): { mode: "incremental" | "resync"; checkpoint: SyncCheckpoint; created: IngestedMessage[] } {
  const plan = planSync({ checkpoint: input.checkpoint, folder: input.folder, uidValidity: input.uidValidity })
  const knownKeys = new Set(input.known.map((row) => deliveryUniqueKey(row.identity)))
  const threadByRfc = new Map<string, string>()
  for (const row of input.known) {
    if (row.rfcMessageId) threadByRfc.set(row.rfcMessageId, row.threadId)
  }
  const created: IngestedMessage[] = []
  let lastUid = plan.fromUid
  const ordered = [...input.headers].sort((a, b) => (uidNumber(a.uid) ?? 0) - (uidNumber(b.uid) ?? 0))
  for (const header of ordered) {
    const uid = uidNumber(header.uid)
    if (uid == null || uid <= plan.fromUid) continue
    lastUid = Math.max(lastUid, uid)
    const identity: MailIdentity = {
      provider: input.provider,
      mailbox: input.mailbox,
      folder: input.folder,
      uid: header.uid,
      uidValidity: input.uidValidity,
      messageId: header.messageId,
    }
    const uniqueKey = deliveryUniqueKey(identity)
    if (knownKeys.has(uniqueKey)) continue
    const parentRfc = threadParentId(
      { messageId: header.messageId, inReplyTo: header.inReplyTo, references: header.references },
      new Set(threadByRfc.keys())
    )
    const existingThread = parentRfc ? threadByRfc.get(parentRfc) ?? null : null
    const threadId = existingThread ?? `thread:${uniqueKey}`
    if (header.messageId) threadByRfc.set(header.messageId, threadId)
    knownKeys.add(uniqueKey)
    created.push({
      uniqueKey,
      threadId,
      newThread: existingThread == null,
      subject: header.subject,
      sender: header.from,
      recipients: header.to,
      occurredAt: header.occurredAt,
      folder: input.folder,
      uid: header.uid,
      uidValidity: input.uidValidity,
      rfcMessageId: header.messageId,
      inReplyTo: header.inReplyTo,
      references: header.references,
      direction: "inbound",
      contentState: "metadata_only",
      senderPlan: matchSenderAddress(input.people, header.from),
      orderSuggestion: suggestOrder(header.subject),
      attachments: header.attachments ?? [],
    })
  }
  return {
    mode: plan.mode,
    checkpoint: { folder: input.folder, uidValidity: input.uidValidity, lastUid },
    created,
  }
}
