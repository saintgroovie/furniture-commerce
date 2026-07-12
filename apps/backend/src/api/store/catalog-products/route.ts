import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadStoreProductList } from "../products/load-store-product-list"
import { projectCatalogProduct } from "../products/catalog-view-projection"

/**
 * Opt-in catalog listing (PERF-02 / G1).
 *
 * Dedicated path avoids Medusa core `StoreGetProductsParams` rejecting
 * unrecognized query keys like `view` on `/store/products`.
 * Default `/store/products` contract stays unchanged.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const products = await loadStoreProductList(req)
  res.json({ products: products.map(projectCatalogProduct) })
}
