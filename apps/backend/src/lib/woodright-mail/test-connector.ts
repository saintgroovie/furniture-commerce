import { MailConnectorError, type ConnectorFailure, type MailConnector, type MailHeader } from "./connector"

type Script = {
  state?: "disabled" | "configured" | "error"
  failure?: ConnectorFailure | null
  headers?: MailHeader[]
  send?: { ok: true; providerMessageId: string } | { ok: false; failure: ConnectorFailure }
}

/** In-memory double. It never opens a socket and never stores a token. */
export function createTestConnector(script: Script = {}): MailConnector & { calls: string[] } {
  const calls: string[] = []
  let state = script.state ?? "configured"
  return {
    calls,
    connectionState: () => state,
    async listHeaders() {
      calls.push("listHeaders")
      if (script.failure) throw new MailConnectorError(script.failure)
      return script.headers ?? []
    },
    async fetchMessage(uid: string) {
      calls.push(`fetch:${uid}`)
      if (script.failure) throw new MailConnectorError(script.failure)
      const headers = (script.headers ?? []).find((row) => row.uid === uid)
      if (!headers) throw new MailConnectorError("timeout")
      return { contentState: "metadata_only", headers }
    },
    async sendReply() {
      calls.push("sendReply")
      if (script.failure === "smtp_rejected") return { ok: false, failure: "smtp_rejected" }
      if (script.failure) throw new MailConnectorError(script.failure)
      return script.send ?? { ok: true, providerMessageId: "sim-1" }
    },
    async reconnect() {
      calls.push("reconnect")
      state = "configured"
    },
  }
}
