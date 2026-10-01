import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buildDeskInbox } from "../../../../lib/woodright-admin/seller-desk"
import { followUpDueBefore, followUpHref, isFollowUpDue, moscowCalendarDate } from "../../../../lib/woodright-crm/follow-up"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isFollowUpEntity } from "../../../../lib/woodright-crm/constants"
import { LEAD_MODULE } from "../../../../modules/lead"
import { BESPOKE_REQUEST_MODULE } from "../../../../modules/bespoke-request"
import { ORDER_PROCESS_MODULE } from "../../../../modules/order-process"
import { loadSellerProducts, queryOf } from "../../../../lib/woodright-workspace/load-seller-products"

type ListService = {
  listLeads?: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
  listBespokeRequests?: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
  listWoodrightOrderProcesses?: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function toWorkspaceHref(href: string): string {
  if (/^\/(people|requests|companies|orders|catalog)(\/|$|\?)/.test(href)) return href
  const url = new URL(href, "http://desk.local")
  if (url.pathname.startsWith("/woodright/requests")) {
    const id = url.searchParams.get("id")
    return id ? `/requests/${id}` : "/requests"
  }
  if (url.pathname.startsWith("/woodright/products/")) {
    return `/catalog/${url.pathname.slice("/woodright/products/".length)}${url.hash}`
  }
  if (url.pathname.startsWith("/woodright/production")) {
    const focus = url.searchParams.get("focus")
    return focus ? `/orders/${focus}` : "/orders"
  }
  if (url.pathname.startsWith("/woodright/media")) return "/media"
  return "/today"
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const products = await loadSellerProducts(queryOf(req))
  const leads = await (req.scope.resolve(LEAD_MODULE) as ListService).listLeads?.({}, { order: { created_at: "DESC" } })
  const requests = await (req.scope.resolve(BESPOKE_REQUEST_MODULE) as ListService).listBespokeRequests?.(
    {},
    { order: { created_at: "DESC" } }
  )
  const processes = await (
    req.scope.resolve(ORDER_PROCESS_MODULE) as ListService
  ).listWoodrightOrderProcesses?.({}, { order: { updated_at: "DESC" } })

  const leadRows = leads ?? []
  const requestRows = requests ?? []
  const leadsById = new Map(leadRows.map((lead) => [String(lead.id), lead]))
  const now = new Date()
  const today = moscowCalendarDate(now)
  let followUps: Array<{ id: string; title: string; hint: string; overdue: boolean; href: string }> = []
  let followUpsTruncated = false
  try {
    const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
      raw: (query: string, bindings?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> }>
    }
    const selected = await sql.raw(
      `select id, entity_type, entity_id, summary, due_at
       from woodright_follow_up
       where deleted_at is null and status = 'open' and due_at < ?
       order by due_at asc
       limit 50`,
      [followUpDueBefore(now)]
    )
    const rows = (selected.rows ?? []).filter((row) => isFollowUpDue(row.due_at instanceof Date ? row.due_at.toISOString() : text(row.due_at), now))
    followUpsTruncated = (selected.rows ?? []).length >= 50
    followUps = rows.flatMap((row) => {
      const dueAt = row.due_at instanceof Date ? row.due_at.toISOString() : text(row.due_at)
      if (!isFollowUpDue(dueAt, now)) return []
      const entityType = text(row.entity_type)
      const entityId = text(row.entity_id)
      if (!entityType || !entityId || !isFollowUpEntity(entityType)) return []
      const dueDay = dueAt ? moscowCalendarDate(new Date(dueAt)) : today
      const leadName = entityType === "person" ? text(leadsById.get(entityId)?.name) : entityType === "request"
        ? text(leadsById.get(String(requestRows.find((item) => String(item.id) === entityId)?.lead_id))?.name)
        : null
      return [{
        id: String(row.id),
        title: leadName || (entityType === "order" ? "Заказ" : entityType === "company" ? "Компания" : "Напоминание"),
        hint: text(row.summary) || "Напоминание",
        overdue: dueDay < today,
        href: followUpHref(entityType, entityId),
      }]
    })
  } catch {
    followUps = []
  }
  const rawInbox = buildDeskInbox({
    now,
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      sku: product.skus[0] ?? null,
      missing_media: !product.readiness.has_media,
      missing_price: product.classification !== "BESPOKE" && !product.readiness.has_price,
      published_invisible: product.status === "published" && !product.readiness.visible,
    })),
    requests: requestRows.map((row) => ({
      id: String(row.id),
      lead_id: String(row.lead_id ?? ""),
      lead_name: text(leadsById.get(String(row.lead_id))?.name),
      status: String(row.status ?? ""),
      comment: text(row.comment),
      created_at: text(row.created_at) ?? text(row.updated_at),
    })),
    processes: (processes ?? []).map((row) => ({
      id: String(row.id),
      order_id: String(row.order_id),
      current_stage: String(row.current_stage),
    })),
    followUps,
  })
  const inbox = rawInbox.map((item) => ({ ...item, href: toWorkspaceHref(item.href) }))

  const attention = {
    missing_media: products.filter((product) => !product.readiness.has_media).length,
    missing_price: products.filter(
      (product) => product.classification !== "BESPOKE" && !product.readiness.has_price
    ).length,
    published_invisible: products.filter(
      (product) => product.status === "published" && !product.readiness.visible
    ).length,
    waiting_customer: (processes ?? []).filter(
      (row) => row.current_stage === "awaiting_customer_approval"
    ).length,
    open_requests: requestRows.filter((row) => row.status === "new" || row.status === "contacted").length,
  }

  res.json({ inbox, attention, follow_ups_truncated: followUpsTruncated })
}
