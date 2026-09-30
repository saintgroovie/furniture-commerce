import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buildDeskInbox } from "../../../../lib/woodright-admin/seller-desk"
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
  const rawInbox = buildDeskInbox({
    now: new Date(),
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

  res.json({ inbox, attention })
}
