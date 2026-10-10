import "server-only"
import { DeskHttpError, medusaGet } from "@/server/medusa"
import { readSession } from "@/server/session"
import {
  fixtureAccess,
  fixtureCompanies,
  fixtureCompany,
  fixtureMailStatus,
  fixtureMailThreads,
  fixtureContacts,
  fixtureOrder,
  fixtureOrders,
  fixturePeople,
  fixturePerson,
  fixtureProduct,
  fixtureProducts,
  fixturePromo,
  fixtureRequests,
  fixtureRooms,
  fixtureToday,
} from "@/server/fixtures"

export type LoadResult<T> = { ok: true; data: T; preview: boolean } | { ok: false; message: string; status: number }

async function load<T>(path: string, preview: T): Promise<LoadResult<T>> {
  const session = await readSession()
  if (!session) return { ok: false, message: "Нужен вход", status: 401 }
  if (session.kind === "preview") return { ok: true, data: preview, preview: true }
  try {
    const data = await medusaGet<T>(path)
    return { ok: true, data, preview: false }
  } catch (error) {
    if (error instanceof DeskHttpError) return { ok: false, message: error.message, status: error.status }
    return { ok: false, message: "Не удалось загрузить данные", status: 500 }
  }
}

export function loadAccess() {
  return load("/admin/woodright/access", fixtureAccess)
}
export function loadToday() {
  return load("/admin/woodright/desk", fixtureToday)
}
export function loadOrders(filter: string) {
  const data = { ...fixtureOrders, filter }
  return load(`/admin/woodright/orders?filter=${encodeURIComponent(filter)}&limit=30&offset=0`, data)
}
/** All pages of a filter for board views (bounded). Returns `truncated` when the cap was hit. */
export async function loadOrdersAll(filter: string, maxPages = 5): Promise<LoadResult<typeof fixtureOrders & { truncated: boolean }>> {
  const first = await loadOrders(filter)
  if (!first.ok) return first
  const orders = [...first.data.orders]
  let hasMore = first.data.has_more
  let page = 1
  while (hasMore && page < maxPages && !first.preview) {
    const offset = page * first.data.limit
    const next = await load(
      `/admin/woodright/orders?filter=${encodeURIComponent(filter)}&limit=${first.data.limit}&offset=${offset}`,
      { ...fixtureOrders, filter, has_more: false }
    )
    if (!next.ok) return next
    orders.push(...next.data.orders)
    hasMore = next.data.has_more
    page += 1
  }
  return { ok: true, preview: first.preview, data: { ...first.data, orders, has_more: hasMore, truncated: hasMore } }
}
export function loadOrder(id: string) {
  return load(`/admin/woodright/orders/${encodeURIComponent(id)}`, fixtureOrder)
}
export function loadPeople() {
  return load("/admin/woodright/people", fixturePeople)
}
export function loadPerson(id: string) {
  return load(`/admin/woodright/people/${encodeURIComponent(id)}`, fixturePerson)
}
export function loadCompanies() {
  return load("/admin/woodright/companies", fixtureCompanies)
}
export function loadCompany(id: string) {
  return load(`/admin/woodright/companies/${encodeURIComponent(id)}`, fixtureCompany)
}
export function loadMailStatus() {
  return load("/admin/woodright/mail/status", fixtureMailStatus)
}
export function loadMailQueue(view = "needs_reply") {
  return load(`/admin/woodright/mail/threads?view=${encodeURIComponent(view)}`, fixtureMailThreads)
}
export function loadMailThread(id: string) {
  return load(`/admin/woodright/mail/threads/${encodeURIComponent(id)}`, {
    thread: {
      id,
      subject: null as string | null,
      status: "open",
      waiting_on: "us",
      assignee_id: null as string | null,
      lead_id: null as string | null,
      company_id: null as string | null,
      request_id: null as string | null,
      order_id: null as string | null,
      mailbox: null as string | null,
    },
    messages: [] as Array<{ id: string; direction: string | null; sender: string | null; occurred_at: string | null; content_state: string }>,
  })
}
export function loadProducts() {
  return load("/admin/woodright/products", fixtureProducts)
}
export function loadProduct(id: string) {
  return load(`/admin/woodright/products/${encodeURIComponent(id)}`, fixtureProduct)
}
export function loadRequests() {
  return load("/admin/bespoke-requests", { bespoke_requests: fixtureRequests.bespoke_requests })
}
export function loadLeads() {
  return load("/admin/leads", { leads: fixtureRequests.leads })
}
export function loadRooms() {
  return load("/admin/room-sets", fixtureRooms)
}
export function loadPromo() {
  return load("/admin/woodright/catalog-promo", fixturePromo)
}
export function loadContacts() {
  return load("/admin/woodright/contacts", fixtureContacts)
}
export function loadSearch(q: string) {
  return load(`/admin/woodright/search?q=${encodeURIComponent(q)}`, {
    hits: q.trim().length < 2 ? [] : [
      { id: "order_sample", group: "order", title: "Заказ 1042", hint: "anna@example.com", href: "/orders/order_sample" },
      { id: "prod_sample", group: "product", title: "Стол Оливер", hint: "OL-01-1", href: "/catalog/prod_sample" },
      { id: "lead_sample", group: "person", title: "Анна Ковалева", hint: "anna@example.com", href: "/people/lead_sample" },
    ],
  })
}
