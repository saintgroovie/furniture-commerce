/**
 * Seller desk inbox - pure projection over Woodright admin payloads.
 * No DB. UI maps these rows to /woodright/* routes.
 */

export type DeskInboxKind = "request" | "catalog" | "production"

export type DeskInboxItem = {
  id: string
  kind: DeskInboxKind
  title: string
  hint: string
  action: string
  overdue: boolean
  href: string
}

export type DeskCatalogHint = {
  id: string
  title: string
  sku: string | null
  missing_media: boolean
  missing_price: boolean
  published_invisible: boolean
}

export type DeskRequestHint = {
  id: string
  lead_id: string
  lead_name: string | null
  status: string
  comment: string | null
  created_at: string | null
}

export type DeskProcessHint = {
  id: string
  order_id: string
  current_stage: string
}

export type DeskLeadHint = {
  id: string
  name: string | null
  source: string | null
}

export type DeskPerson = {
  id: string
  name: string
  source: string | null
  request_ids: string[]
  request_count: number
}

export const REQUEST_SLA_HOURS = 2

export const BESPOKE_STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  contacted: "Связались",
  quote_sent: "Расчёт отправлен",
  paid: "Оплачено",
  in_production: "В производстве",
  completed: "Завершена",
}

export const DESK_STAGE_LABEL: Record<string, string> = {
  new: "Новый заказ",
  needs_confirmation: "Требует подтверждения",
  specification_in_progress: "Согласование комплектации",
  awaiting_customer_approval: "Ожидает согласования клиента",
  confirmed: "Подтверждён",
  in_production: "В производстве",
  quality_control: "Проверка качества",
  ready_for_delivery: "Готов к передаче",
  on_hold: "Приостановлен",
  canceled: "Отменён",
}

export function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, (now.getTime() - t) / 3_600_000)
}

export function buildDeskInbox(input: {
  products: DeskCatalogHint[]
  requests: DeskRequestHint[]
  processes: DeskProcessHint[]
  now: Date
}): DeskInboxItem[] {
  const items: DeskInboxItem[] = []

  for (const req of input.requests) {
    if (req.status !== "new" && req.status !== "contacted") continue
    const hours = hoursSince(req.created_at, input.now)
    const overdue = hours != null && hours >= REQUEST_SLA_HOURS
    const who = (req.lead_name && req.lead_name.trim()) || "Заявка"
    items.push({
      id: `req:${req.id}`,
      kind: "request",
      title: who,
      hint: req.comment?.trim() || BESPOKE_STATUS_LABEL[req.status] || req.status,
      action: "Открыть заявку",
      overdue,
      href: `/woodright/requests?id=${encodeURIComponent(req.id)}`,
    })
  }

  for (const product of input.products) {
    if (product.published_invisible) {
      items.push({
        id: `cat-inv:${product.id}`,
        kind: "catalog",
        title: product.title,
        hint: "Опубликован, покупатель не найдёт",
        action: "Исправить видимость",
        overdue: true,
        href: `/woodright/products/${product.id}`,
      })
    }
    if (product.missing_media) {
      items.push({
        id: `cat-media:${product.id}`,
        kind: "catalog",
        title: product.title,
        hint: product.sku ? `${product.sku} - нет фото` : "Нет фото",
        action: "Открыть карточку",
        overdue: true,
        href: `/woodright/products/${product.id}`,
      })
    }
    if (product.missing_price) {
      items.push({
        id: `cat-price:${product.id}`,
        kind: "catalog",
        title: product.title,
        hint: "Нет цены",
        action: "Поставить цену",
        overdue: false,
        href: `/woodright/products/${product.id}`,
      })
    }
  }

  for (const process of input.processes) {
    if (process.current_stage !== "awaiting_customer_approval") continue
    items.push({
      id: `ord:${process.id}`,
      kind: "production",
      title: `Заказ ${process.order_id}`,
      hint: DESK_STAGE_LABEL[process.current_stage] ?? process.current_stage,
      action: "Открыть этап",
      overdue: true,
      href: `/woodright/production?focus=${encodeURIComponent(process.order_id)}`,
    })
  }

  items.sort((a, b) => Number(b.overdue) - Number(a.overdue))
  return items
}

export function buildDeskPeople(
  leads: DeskLeadHint[],
  requests: DeskRequestHint[]
): DeskPerson[] {
  const byLead = new Map<string, DeskPerson>()
  for (const lead of leads) {
    const name = (lead.name && lead.name.trim()) || "Без имени"
    byLead.set(lead.id, {
      id: lead.id,
      name,
      source: lead.source,
      request_ids: [],
      request_count: 0,
    })
  }
  for (const req of requests) {
    const existing = byLead.get(req.lead_id)
    if (existing) {
      existing.request_ids.push(req.id)
      existing.request_count = existing.request_ids.length
      continue
    }
    byLead.set(req.lead_id, {
      id: req.lead_id,
      name: (req.lead_name && req.lead_name.trim()) || "Без имени",
      source: null,
      request_ids: [req.id],
      request_count: 1,
    })
  }
  return [...byLead.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"))
}
