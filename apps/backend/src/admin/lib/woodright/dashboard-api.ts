/**
 * Package F — Admin API fetch helpers for the Woodright dashboard.
 * Read-only, stock Medusa Admin REST, session cookies. Same union convention
 * as the other Woodright api modules: success payload | { status, body }.
 *
 * Dashboard contract: no whole-catalog downloads — counters use limit=1 +
 * count, samples are bounded to a few pages.
 */

export type ApiFailure = { status: number; body: unknown }

export type DashboardProductHit = {
  id: string
  title?: string | null
  handle?: string | null
  thumbnail?: string | null
  status?: string | null
  updated_at?: string | null
  variants?: Array<{ sku?: string | null }> | null
}

export type DashboardPromotionHit = {
  id: string
  code?: string | null
  is_automatic?: boolean | null
  status?: string | null
  updated_at?: string | null
}

async function getJson(
  url: string,
  init?: RequestInit
): Promise<{ ok: true; body: unknown } | ApiFailure> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return { ok: true, body }
}

/** Draft product counter: limit=1, only `count` is used. */
export async function fetchDraftProductCount(
  init?: RequestInit
): Promise<{ count: number } | ApiFailure> {
  const search = new URLSearchParams()
  search.set("status[]", "draft")
  search.set("limit", "1")
  search.set("fields", "id")
  const res = await getJson(`/admin/products?${search.toString()}`, init)
  if ("status" in res) return res
  return { count: (res.body as { count?: number }).count ?? 0 }
}

/**
 * One bounded page of published products for the thumbnail sample
 * (fields limited to id/thumbnail/status).
 */
export async function fetchPublishedProductsPage(
  params: { limit: number; offset: number },
  init?: RequestInit
): Promise<
  | { products: Array<{ id: string; thumbnail?: string | null }>; count: number }
  | ApiFailure
> {
  const search = new URLSearchParams()
  search.set("status[]", "published")
  search.set("limit", String(params.limit))
  search.set("offset", String(params.offset))
  search.set("fields", "id,title,thumbnail,status")
  const res = await getJson(`/admin/products?${search.toString()}`, init)
  if ("status" in res) return res
  const body = res.body as {
    products?: Array<{ id: string; title?: string | null; thumbnail?: string | null }>
    count?: number
  }
  return { products: body.products ?? [], count: body.count ?? 0 }
}

/** Server-side product search with pagination for the dashboard search block. */
export async function searchAdminProducts(
  params: { q?: string; limit: number; offset: number },
  init?: RequestInit
): Promise<{ products: DashboardProductHit[]; count: number } | ApiFailure> {
  const search = new URLSearchParams()
  search.set("limit", String(params.limit))
  search.set("offset", String(params.offset))
  search.set("fields", "id,title,handle,thumbnail,status,updated_at,variants.sku")
  if (params.q?.trim()) search.set("q", params.q.trim())
  const res = await getJson(`/admin/products?${search.toString()}`, init)
  if ("status" in res) return res
  const body = res.body as { products?: DashboardProductHit[]; count?: number }
  return { products: body.products ?? [], count: body.count ?? 0 }
}

/**
 * Recent products by updated_at. Medusa 2.13.3 accepts `order=-updated_at`
 * on /admin/products; if the API ever rejects it, callers must hide the
 * section instead of showing wrong ordering.
 */
export async function fetchRecentProducts(
  limit = 5,
  init?: RequestInit
): Promise<{ products: DashboardProductHit[] } | ApiFailure> {
  const search = new URLSearchParams()
  search.set("limit", String(limit))
  search.set("order", "-updated_at")
  search.set("fields", "id,title,handle,thumbnail,status,updated_at")
  const res = await getJson(`/admin/products?${search.toString()}`, init)
  if ("status" in res) return res
  const body = res.body as { products?: DashboardProductHit[] }
  return { products: body.products ?? [] }
}

/** Recent promotions by updated_at; same honesty rule as fetchRecentProducts. */
export async function fetchRecentPromotions(
  limit = 5,
  init?: RequestInit
): Promise<{ promotions: DashboardPromotionHit[] } | ApiFailure> {
  const search = new URLSearchParams()
  search.set("limit", String(limit))
  search.set("order", "-updated_at")
  search.set("fields", "id,code,is_automatic,status,updated_at")
  const res = await getJson(`/admin/promotions?${search.toString()}`, init)
  if ("status" in res) return res
  const body = res.body as { promotions?: DashboardPromotionHit[] }
  return { promotions: body.promotions ?? [] }
}

export function woodrightDashboardPath(): string {
  return "/app/woodright"
}
