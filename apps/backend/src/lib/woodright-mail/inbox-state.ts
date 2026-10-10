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

export type MailView = "needs_reply" | "mine" | "unassigned" | "waiting" | "closed"

export const THREAD_LIST_LIMIT = 100

/** ISO timestamps sort as text. A Date must not be stringified with the default locale form. */
export function threadRecency(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return typeof value === "string" ? value : ""
}

/**
 * Predicates applied by the database before the limit.
 * A view that is not one equality is split into separate queries.
 */
export function threadListFilters(view: MailView, actorId: string | null): Array<Record<string, string | null>> {
  if (view === "needs_reply") return [{ status: "open", waiting_on: "us" }]
  if (view === "closed") return [{ status: "closed" }]
  if (view === "waiting") {
    return [
      { status: "open", waiting_on: "client" },
      { status: "waiting", waiting_on: "client" },
    ]
  }
  if (!actorId && view === "mine") return []
  const assignee = view === "mine" ? actorId : null
  return [
    { status: "open", assignee_id: assignee },
    { status: "waiting", assignee_id: assignee },
  ]
}

export function filterThreads<T extends { status: string; waiting_on: string; assignee_id: string | null }>(
  rows: T[],
  view: MailView,
  actorId: string | null
): T[] {
  if (view === "needs_reply") return rows.filter((row) => row.status === "open" && row.waiting_on === "us")
  if (view === "mine") return rows.filter((row) => actorId != null && row.assignee_id === actorId && row.status !== "closed")
  if (view === "unassigned") return rows.filter((row) => !row.assignee_id && row.status !== "closed")
  if (view === "waiting") return rows.filter((row) => row.status !== "closed" && row.waiting_on === "client")
  return rows.filter((row) => row.status === "closed")
}

export type MailTodayThread = {
  id: string
  subject: string | null
  sender: string | null
  status: string
  waiting_on: string
  request_id: string | null
}

/** Only threads that still need us. Skip one already shown via its request. */
export function mailTodayItems(threads: MailTodayThread[], existingHrefs: string[]): Array<{ id: string; href: string; title: string; hint: string }> {
  const hrefs = new Set(existingHrefs)
  return threads
    .filter((thread) => thread.status === "open" && thread.waiting_on === "us")
    .filter((thread) => !thread.request_id || !hrefs.has(`/requests/${thread.request_id}`))
    .map((thread) => ({
      id: `mail:${thread.id}`,
      href: `/inbox/${thread.id}`,
      title: thread.sender || "Неизвестный отправитель",
      hint: thread.subject || "Без темы",
    }))
}
