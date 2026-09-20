import { getBaseUrl, medusaFetch } from "./base"
import { parseStoreCatalogProductsPayload } from "../catalog-browse-pool"

/**
 * Browser fetch of the Medusa browse projection (same-origin `/store` rewrite).
 * Do not use `medusaCatalogFetch` here: `next.revalidate` is SSR-only.
 */
export async function fetchStoreCatalogProducts(): Promise<
  Array<Record<string, unknown>>
> {
  const res = await medusaFetch(`${getBaseUrl()}/store/catalog-products`)
  if (!res.ok) {
    throw new Error("Не удалось загрузить каталог.")
  }
  return parseStoreCatalogProductsPayload(await res.json())
}
