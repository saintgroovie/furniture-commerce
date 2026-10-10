/**
 * Live Yandex is intentionally absent.
 * Rechecked 2026-10-10 against current Yandex docs:
 * mailbox access is IMAP/SMTP XOAUTH2 (imap.yandex.com:993, smtp.yandex.com:465).
 * A later read-only discovery uses the read IMAP scope only, not SMTP and not full mailbox delete.
 * Organization inventory is a separate Yandex 360 admin API on cloud-api.yandex.net.
 * This process never opens either, and it never stores a token.
 */
export type ConnectorFailure =
  | "token_unavailable"
  | "token_expired"
  | "token_revoked"
  | "timeout"
  | "provider_unavailable"
  | "body_unavailable"
  | "attachment_unavailable"
  | "smtp_rejected"

export type MailHeader = {
  uid: string
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  subject: string | null
  from: string
  occurredAt: string
}

export type MailBody =
  | { available: false; failure: "body_unavailable" }
  | { available: true; text: string }

export type MailAttachment =
  | { available: false; failure: "attachment_unavailable" }
  | { available: true; filename: string | null; mime: string | null; bytes: Uint8Array }

export type MailConnector = {
  connectionState: () => "disabled" | "configured" | "error"
  listHeaders: (input: { folder: string; fromUid: number }) => Promise<MailHeader[]>
  fetchMessage: (uid: string) => Promise<{ contentState: "metadata_only"; headers: MailHeader }>
  /** On demand. Callers must not persist the text. */
  fetchBody: (uid: string) => Promise<MailBody>
  loadAttachment: (providerRef: string) => Promise<MailAttachment>
  sendReply: (input: { threadId: string; text: string }) => Promise<{ ok: true; providerMessageId: string } | { ok: false; failure: ConnectorFailure }>
  reconnect: () => Promise<void>
}

export class MailConnectorError extends Error {
  constructor(readonly failure: ConnectorFailure) {
    super(failure)
  }
}
