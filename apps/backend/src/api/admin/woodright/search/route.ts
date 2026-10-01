import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BESPOKE_REQUEST_MODULE } from "../../../../modules/bespoke-request"
import { LEAD_MODULE } from "../../../../modules/lead"
import { loadSellerProducts, queryOf } from "../../../../lib/woodright-workspace/load-seller-products"
import { searchHits } from "../../../../lib/woodright-workspace/search"
import { CRM_MODULE } from "../../../../modules/crm"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = typeof req.query.q === "string" ? req.query.q : ""
  if (q.trim().length < 2) {
    res.json({ hits: [] })
    return
  }
  const query = queryOf(req)
  const [products, leads, requests, orderData] = await Promise.all([
    loadSellerProducts(query),
    (req.scope.resolve(LEAD_MODULE) as {
      listLeads: (filters: object) => Promise<Array<Record<string, unknown>>>
    }).listLeads({}),
    (req.scope.resolve(BESPOKE_REQUEST_MODULE) as {
      listBespokeRequests: (filters: object) => Promise<Array<Record<string, unknown>>>
    }).listBespokeRequests({}),
    query.graph({
      entity: "order",
      fields: ["id", "display_id", "email"],
      pagination: { take: 50, skip: 0 },
    }),
  ])
  const leadRows = leads ?? []
  const leadsById = new Map(leadRows.map((lead) => [String(lead.id), lead]))
  let companies: Array<{ id: string; name: string | null }> = []
  try {
    const rows = await (req.scope.resolve(CRM_MODULE) as {
      listCompanies: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
    }).listCompanies({}, { take: 100 })
    companies = (rows ?? []).map((row) => ({ id: String(row.id), name: text(row.name) }))
  } catch {
    companies = []
  }
  const hits = searchHits({
    q,
    limit: 12,
    products: products.map((product) => ({ id: product.id, title: product.title, skus: product.skus })),
    people: leadRows.map((lead) => ({
      id: String(lead.id),
      name: text(lead.name),
      email: text(lead.email),
      phone: text(lead.phone),
    })),
    requests: (requests ?? []).map((row) => ({
      id: String(row.id),
      name: text(leadsById.get(String(row.lead_id))?.name),
      comment: text(row.comment),
    })),
    orders: ((orderData.data ?? []) as Array<Record<string, unknown>>).map((order) => ({
      id: String(order.id),
      display_id: (order.display_id as string | number | null) ?? null,
      email: text(order.email),
    })),
    companies,
  })
  res.json({ hits })
}
