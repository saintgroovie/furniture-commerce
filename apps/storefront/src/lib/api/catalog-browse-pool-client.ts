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
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : undefined
  const res = await medusaFetch(`${getBaseUrl()}/store/catalog-products`, requestSignal ? { signal: requestSignal } : undefined)
  if (!res.ok) {
    throw new Error("Не удалось загрузить каталог.")
  }
  return parseStoreCatalogProductsPayload(await res.json())
}
