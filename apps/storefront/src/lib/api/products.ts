import { qualifyNativeFamilyCatalog } from "../qualified-native-family"
import { resolveCatalogCardPrice } from "../catalog-card-price"
import { cache, cacheSignal } from "react"
import { isBuyerPublicProductStatus } from "../buyer-publication"
import { getBaseUrl, medusaFetch, medusaFetchTimeoutMs } from "./base"
import { withCatalogReadBudget } from "../catalog-read-budget"

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
 * Prices and photos must reflect completed admin edits on the next read.
 * Do not use the stale-while-revalidate cache used by room membership.
 * Catalog pages call this once per render; related cards use exact handle reads.
 */
export async function getCatalogProducts(options: { qualifyFamilies?: boolean } = {}) {
  return withCatalogReadBudget(async signal => {
    const data = await readCatalogProducts(undefined, signal)
    if (options.qualifyFamilies !== false && Array.isArray(data.products)) {
      data.products = await qualifyNativeFamilyCatalog(data.products, async id => {
        signal.throwIfAborted()
        const response = await medusaFetch(`${getBaseUrl()}/store/products/${encodeURIComponent(id)}`, { signal })
        if (!response.ok) return null
        const body = await response.json() as { product?: Record<string, unknown> }
        return body.product ?? null
      }, product => resolveCatalogCardPrice(product))
    }
    signal.throwIfAborted()
    return data
  }, cacheSignal(), medusaFetchTimeoutMs())
}

async function readCatalogProducts(handle?: string, signal?: AbortSignal) {
  const base = getBaseUrl()
  const query = handle == null ? "" : `?${new URLSearchParams({ handle })}`
  const res = await medusaFetch(`${base}/store/catalog-products${query}`, signal ? { signal } : undefined)
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
  const data = (await res.json()) as { products?: unknown }
  if (Array.isArray(data.products)) {
    data.products = data.products.filter(
      (product) =>
        !!product &&
        typeof product === "object" &&
        isBuyerPublicProductStatus((product as { status?: unknown }).status)
    )
  }
  return data
}

/** A related block must not materialize the entire catalog on every PDP. */
export async function getCatalogProductsForHandles(handles: string[]): Promise<{
  products: Array<Record<string, unknown>>
}> {
  const unique = [...new Set(handles.filter((handle) => typeof handle === "string" && handle.length > 0))]
  const products: Array<Record<string, unknown>> = []
  // Bound both response memory and native graph concurrency.
  for (let i = 0; i < unique.length; i += 3) {
    const batch = unique.slice(i, i + 3)
    const responses = await Promise.all(batch.map((handle) => readCatalogProducts(handle)))
    responses.forEach((data, index) => {
      if (!Array.isArray(data.products)) return
      products.push(...data.products.filter(
        (product): product is Record<string, unknown> =>
          !!product && typeof product === "object" && product.handle === batch[index]
      ))
    })
  }
  return { products }
}

export const NOT_FOUND = "NOT_FOUND"

export type ProductCompatibilityCard = {
  id: string
  title: string
  handle: string
}

/** Links only. Empty when the product has no published matches. */
export async function getProductCompatibility(productId: string): Promise<{
  accessories: ProductCompatibilityCard[]
  compatible_with: ProductCompatibilityCard[]
}> {
  const empty = { accessories: [], compatible_with: [] }
  const base = getBaseUrl()
  try {
    const res = await medusaFetch(
      `${base}/store/products/${encodeURIComponent(productId)}/compatibility`
    )
    if (!res.ok) return empty
    const data = (await res.json()) as {
      accessories?: ProductCompatibilityCard[]
      compatible_with?: ProductCompatibilityCard[]
    }
    return {
      accessories: Array.isArray(data.accessories) ? data.accessories : [],
      compatible_with: Array.isArray(data.compatible_with) ? data.compatible_with : [],
    }
  } catch {
    return empty
  }
}

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

function publicProductOrThrow(product: Record<string, unknown> | null | undefined) {
  if (!product || !isBuyerPublicProductStatus(product.status)) {
    throw new Error(NOT_FOUND)
  }
  return product
}

/**
 * Resolve by Medusa product id or by `handle` when the direct id route 404s.
 * Cached per RSC request so the root layout status gate and the page share
 * one backend read.
 */
export const getProduct = cache(async function getProduct(idOrHandle: string) {
  const base = getBaseUrl()
  const key = idOrHandle.trim()
  const res = await medusaFetch(`${base}/store/products/${encodeURIComponent(key)}`)
  if (res.ok) {
    const body = (await res.json()) as { product?: Record<string, unknown> }
    return { product: publicProductOrThrow(body.product) }
  }
  if (res.status === 404) {
    const byHandle = await listStoreProductByHandle(base, key)
    if (byHandle) return { product: publicProductOrThrow(byHandle) }
    throw new Error(NOT_FOUND)
  }
  const data = await res.json().catch(() => ({}))
  throw new Error((data as { message?: string }).message ?? (await res.text()))
})
