import { MailConnectorError, type ConnectorFailure, type MailConnector } from "./connector"

export type StaffDelivery =
  | { state: "internal" }
  | { state: "sent"; providerMessageId: string }
  | { state: "rejected"; failure: ConnectorFailure | "empty"; draft: string }
  | { state: "uncertain"; draft: string }

/**
 * A team note never touches the connector.
 * A reply is recorded only after the connector accepts it.
 * The same provider id is not sent twice.
 */
export async function deliverStaffText(input: {
  kind: "reply" | "note"
  text: string
  threadId: string
  alreadyAcceptedId: string | null
  connector: MailConnector
}): Promise<{ delivery: StaffDelivery; called: boolean }> {
  if (input.kind === "note") return { delivery: { state: "internal" }, called: false }
  if (input.alreadyAcceptedId) {
    return { delivery: { state: "sent", providerMessageId: input.alreadyAcceptedId }, called: false }
  }
  const text = input.text.trim()
  if (!text) return { delivery: { state: "rejected", failure: "empty", draft: input.text }, called: false }
  try {
    const sent = await input.connector.sendReply({ threadId: input.threadId, text })
    if (!sent.ok) return { delivery: { state: "rejected", failure: sent.failure, draft: input.text }, called: true }
    return { delivery: { state: "sent", providerMessageId: sent.providerMessageId }, called: true }
  } catch (error) {
    if (error instanceof MailConnectorError && error.failure === "timeout") {
      return { delivery: { state: "uncertain", draft: input.text }, called: true }
    }
    if (error instanceof MailConnectorError) {
      return { delivery: { state: "rejected", failure: error.failure, draft: input.text }, called: true }
    }
    throw error
  }
}

/** Closing a CRM thread does not delete or move the provider message. */
export function closeThreadPlan(): { status: "closed"; waiting_on: "nobody"; providerDelete: false; providerMove: false } {
  return { status: "closed", waiting_on: "nobody", providerDelete: false, providerMove: false }
}

/** CRM attention is waiting_on. IMAP Seen is left alone. */
export function seenPlan(): { crm: "waiting_on"; imapFlags: "unchanged" } {
  return { crm: "waiting_on", imapFlags: "unchanged" }
}
