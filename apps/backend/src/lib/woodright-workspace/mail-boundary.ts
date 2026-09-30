/**
 * Future mail index. Yandex remains the mailbox archive.
 * Bodies and attachments are intentionally absent.
 * Phase 1 never opens IMAP or SMTP, even if an env flag is set.
 */

export type FutureCommunicationChannel =
  | "email"
  | "phone"
  | "whatsapp"
  | "telegram"
  | "web_form"
  | "site_chat"

export type FutureThreadStatus = "open" | "waiting" | "closed"

export type CommunicationThreadShape = {
  id: string
  channel: FutureCommunicationChannel
  subject: string | null
  contact_id: string | null
  request_id: string | null
  order_id: string | null
  assignee_id: string | null
  status: FutureThreadStatus
}

export type CommunicationShape = {
  thread_id: string
  provider_message_id: string
  direction: "inbound" | "outbound"
  from: string
  to: string[]
  occurred_at: string
}

export function mailConnectorEnabled(_env: NodeJS.ProcessEnv = process.env): false {
  return false
}
