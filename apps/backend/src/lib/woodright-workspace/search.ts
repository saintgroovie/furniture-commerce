export type SearchGroup = "order" | "product" | "person" | "request"

export type SearchHit = {
  id: string
  group: SearchGroup
  title: string
  hint: string | null
  href: string
}

export function searchHits(input: {
  q: string
  limit?: number
  orders: Array<{ id: string; display_id?: string | number | null; email?: string | null }>
  products: Array<{ id: string; title: string; skus?: string[] }>
  people: Array<{ id: string; name?: string | null; email?: string | null; phone?: string | null }>
  requests: Array<{ id: string; name?: string | null; comment?: string | null }>
}): SearchHit[] {
  const needle = input.q.trim().toLowerCase()
  if (needle.length < 2) return []
  const limit = input.limit ?? 8
  const hits: SearchHit[] = []

  const push = (hit: SearchHit) => {
    if (hits.length < limit * 4) hits.push(hit)
  }

  for (const order of input.orders) {
    const display = order.display_id != null ? String(order.display_id) : ""
    const email = order.email ?? ""
    if (display.toLowerCase().includes(needle) || email.toLowerCase().includes(needle) || order.id.toLowerCase().includes(needle)) {
      push({
        id: order.id,
        group: "order",
        title: display ? `Заказ ${display}` : "Заказ",
        hint: email || null,
        href: `/orders/${order.id}`,
      })
    }
  }
  for (const product of input.products) {
    const sku = (product.skus ?? []).join(" ")
    if (product.title.toLowerCase().includes(needle) || sku.toLowerCase().includes(needle)) {
      push({
        id: product.id,
        group: "product",
        title: product.title,
        hint: product.skus?.[0] ?? null,
        href: `/catalog/${product.id}`,
      })
    }
  }
  for (const person of input.people) {
    const blob = `${person.name ?? ""} ${person.email ?? ""} ${person.phone ?? ""}`.toLowerCase()
    if (blob.includes(needle)) {
      push({
        id: person.id,
        group: "person",
        title: person.name?.trim() || "Без имени",
        hint: person.email || person.phone || null,
        href: `/people/${person.id}`,
      })
    }
  }
  for (const request of input.requests) {
    const blob = `${request.name ?? ""} ${request.comment ?? ""} ${request.id}`.toLowerCase()
    if (blob.includes(needle)) {
      push({
        id: request.id,
        group: "request",
        title: request.name?.trim() || "Заявка",
        hint: request.comment ?? null,
        href: `/requests/${request.id}`,
      })
    }
  }
  return hits.slice(0, limit)
}
