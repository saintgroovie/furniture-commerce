export type ConnectorFailure =
  | "token_unavailable"
  | "token_expired"
  | "token_revoked"
  | "timeout"
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

export type MailConnector = {
  connectionState: () => "disabled" | "configured" | "error"
  listHeaders: (input: { folder: string; fromUid: number }) => Promise<MailHeader[]>
  fetchMessage: (uid: string) => Promise<{ contentState: "metadata_only"; headers: MailHeader }>
  sendReply: (input: { threadId: string; text: string }) => Promise<{ ok: true; providerMessageId: string } | { ok: false; failure: ConnectorFailure }>
  reconnect: () => Promise<void>
}

export class MailConnectorError extends Error {
  constructor(readonly failure: ConnectorFailure) {
    super(failure)
  }
}
