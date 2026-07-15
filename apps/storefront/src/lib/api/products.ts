import { getBaseUrl, medusaCatalogFetch, medusaFetch } from "./base"

export async function getProducts(params?: {
  category_id?: string
  product_type?: string
  limit?: number
}) {
  const base = getBaseUrl()
  const search = new URLSearchParams()
  if (params?.category_id) search.set("category_id", params.category_id)
  if (params?.product_type) search.set("product_type", params.product_type)
  if (params?.limit != null) search.set("limit", String(params.limit))
  const url = `${base}/store/products${search.toString() ? `?${search}` : ""}`
  const res = await medusaFetch(url)
  if (!res.ok) {
    const text = await res.text()
    let message = "Не удалось загрузить каталог."
    try {
      const data = text ? JSON.parse(text) : null
      if (data && typeof (data as { message?: unknown }).message === "string") {
        message = (data as { message: string }).message
      } else if (text) {
        message = text
      }
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  return res.json()
}

/**
 * Catalog listing fetch — opt-in `/store/catalog-products` projection (PERF-02).
 * Dedicated path: Medusa core rejects unknown query keys (e.g. `view`) on `/store/products`.
 *
 * Uses `medusaCatalogFetch` (short revalidate), not cart `no-store`.
 * No React `cache()` wrapper: React 18.3.1 does not export `cache`, and catalog
 * pages call this once per RSC request (kids membership uses passed products).
 */
export async function getCatalogProducts() {
  const base = getBaseUrl()
  const res = await medusaCatalogFetch(`${base}/store/catalog-products`)
  if (!res.ok) {
    const text = await res.text()
    let message = "Не удалось загрузить каталог."
    try {
      const data = text ? JSON.parse(text) : null
      if (data && typeof (data as { message?: unknown }).message === "string") {
        message = (data as { message: string }).message
      } else if (text) {
        message = text
      }
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  return res.json()
}

export const NOT_FOUND = "NOT_FOUND"

async function listStoreProductByHandle(
  base: string,
  handle: string
): Promise<Record<string, unknown> | null> {
  const search = new URLSearchParams({
    handle,
    limit: "1",
  })
  const res = await medusaFetch(`${base}/store/products?${search}`)
  if (!res.ok) return null
  const data = (await res.json()) as { products?: Record<string, unknown>[] }
  return data.products?.[0] ?? null
}

/** Resolve by Medusa product id or by `handle` when the direct id route 404s. */
export async function getProduct(idOrHandle: string) {
  const base = getBaseUrl()
  const key = idOrHandle.trim()
  const res = await medusaFetch(`${base}/store/products/${encodeURIComponent(key)}`)
  if (res.ok) return res.json()
  if (res.status === 404) {
    const byHandle = await listStoreProductByHandle(base, key)
    if (byHandle) return { product: byHandle }
    throw new Error(NOT_FOUND)
  }
  const data = await res.json().catch(() => ({}))
  throw new Error((data as { message?: string }).message ?? (await res.text()))
}
