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
 * Backend inbox → action groups. Nothing is recomputed: the group follows
 * `kind`, the reason stays the backend hint, the href stays the backend href.
 */
export function groupInbox(items: InboxItem[]): QueueGroup[] {
  const groups: QueueGroup[] = [
    { id: "requests", title: "Требует ответа", items: [] },
    { id: "production", title: "Заказы", items: [] },
    { id: "catalog", title: "Каталог", items: [] },
  ]
  for (const item of items) {
    const target = item.kind === "request" ? groups[0] : item.kind === "production" ? groups[1] : groups[2]
    target!.items.push(item)
  }
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
