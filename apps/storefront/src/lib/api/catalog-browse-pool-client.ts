import { qualifyNativeFamilyCatalog } from "../qualified-native-family"
import { resolveCatalogCardPrice } from "../catalog-card-price"
import { getBaseUrl, medusaFetch } from "./base"
import { parseStoreCatalogProductsPayload } from "../catalog-browse-pool"

/**
 * Browser fetch of the Medusa browse projection (same-origin `/store` rewrite).
 * Do not use `medusaCatalogFetch` here: `next.revalidate` is SSR-only.
 */
export async function fetchStoreCatalogProducts(signal?: AbortSignal): Promise<
  Array<Record<string, unknown>>
> {
  // Caller cancellation must keep the existing eight-second read budget too.
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000)
  const res = await medusaFetch(`${getBaseUrl()}/store/catalog-products`, requestSignal ? { signal: requestSignal } : undefined)
  if (!res.ok) {
    throw new Error("Не удалось загрузить каталог.")
  }
  const products = parseStoreCatalogProductsPayload(await res.json())
  const qualified = await qualifyNativeFamilyCatalog(products, async id => {
    requestSignal.throwIfAborted()
    const response = await medusaFetch(`${getBaseUrl()}/store/products/${encodeURIComponent(id)}`, { signal: requestSignal })
    if (!response.ok) return null
    const body = await response.json() as { product?: Record<string, unknown> }
    return body.product ?? null
  }, product => resolveCatalogCardPrice(product))
  requestSignal.throwIfAborted()
  return qualified
}
