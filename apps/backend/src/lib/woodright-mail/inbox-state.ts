export type MailConnectionStatus = "disabled" | "configured" | "error"

/**
 * Inbox is visible only when the backend connection is configured,
 * the person is permitted, and the live connector is actually enabled.
 * A frontend env flag cannot turn this on.
 */
export function decideInbox(input: {
  connectionStatus: MailConnectionStatus | null
  permitted: boolean
  liveConnector: boolean
}): { visible: boolean; reason: "not_configured" | "not_permitted" | "connector_disabled" | "ready" } {
  if (input.connectionStatus !== "configured") return { visible: false, reason: "not_configured" }
  if (!input.permitted) return { visible: false, reason: "not_permitted" }
  if (!input.liveConnector) return { visible: false, reason: "connector_disabled" }
  return { visible: true, reason: "ready" }
}
