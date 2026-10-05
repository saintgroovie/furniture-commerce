import type { StateView } from "./state"

export type InboxItem = {
  id: string
  kind: string
  title: string
  hint: string
  action: string
  overdue: boolean
  href: string
}

export type QueueGroup = { id: string; title: string; items: InboxItem[] }

/**
 * One highest-priority group per row. Overdue wins over waiting and catalog,
 * so the same record is not listed twice. Empty groups are omitted.
 * Unassigned is not a group: the inbox has no assignee of its own.
 */
export function inboxGroup(item: InboxItem): "overdue" | "today" | "waiting" | "catalog" {
  if (item.overdue) return "overdue"
  if (item.kind === "production") return "waiting"
  if (item.kind === "catalog") return "catalog"
  return "today"
}

export function groupInbox(items: InboxItem[]): QueueGroup[] {
  const groups: QueueGroup[] = [
    { id: "overdue", title: "Просрочено", items: [] },
    { id: "today", title: "На сегодня", items: [] },
    { id: "waiting", title: "Ждём клиента", items: [] },
    { id: "catalog", title: "Блокеры каталога", items: [] },
  ]
  const byId = new Map(groups.map((group) => [group.id, group]))
  for (const item of items) byId.get(inboxGroup(item))?.items.push(item)
  return groups.filter((group) => group.items.length > 0)
}

export function queueState(item: InboxItem): StateView {
  if (item.kind === "catalog" && /нет цены/i.test(item.hint)) return { tone: "critical", label: "Нет цены" }
  if (item.kind === "catalog" && /нет фото/i.test(item.hint)) return { tone: "attention", label: "Нет фото" }
  if (item.kind === "catalog") return { tone: "attention", label: "Проверить" }
  if (item.overdue) return { tone: "critical", label: "Просрочено" }
  return { tone: "waiting", label: "На сегодня" }
}

/** Counters stay linked to real filtered lists. */
export const ATTENTION_LINKS: Array<{ key: "open_requests" | "missing_price" | "waiting_customer" | "missing_media"; label: string; href: string }> = [
  { key: "open_requests", label: "Новые заявки", href: "/clients?mode=requests" },
  { key: "waiting_customer", label: "Ждём клиента", href: "/orders?filter=waiting" },
  { key: "missing_price", label: "Нет цены", href: "/catalog?filter=missing_price" },
  { key: "missing_media", label: "Нет фото", href: "/catalog?filter=missing_media" },
]
