import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadStoreProductList } from "../products/load-store-product-list"
import { projectCatalogBrowseProduct } from "../products/catalog-browse-projection"

/**
 * Opt-in catalog listing (PERF-02 / G1 → PERF-03 / G2).
 *
 * Dedicated path avoids Medusa core `StoreGetProductsParams` rejecting
 * unrecognized query keys on `/store/products`.
 * G2: explicit allowlist browse DTO (not metadata denylist).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const products = await loadStoreProductList(req, { mode: "browse" })
  res.json({ products: products.map(projectCatalogBrowseProduct) })
}
