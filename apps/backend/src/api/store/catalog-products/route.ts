import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadStoreProductList } from "../products/load-store-product-list"
import { projectCatalogBrowseProduct } from "../products/catalog-browse-projection"
import {
  browseCatalogCoalesceKey,
  coalesceBrowseCatalog,
} from "./coalesce-browse-catalog"

const PROJECT_SLICE = 32

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

async function projectBrowseProducts(
  products: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = []
  for (let i = 0; i < products.length; i++) {
    out.push(projectCatalogBrowseProduct(products[i]))
    if ((i + 1) % PROJECT_SLICE === 0) await yieldEventLoop()
  }
  return out
}

/**
 * Opt-in catalog listing (PERF-02 / G1 → PERF-03 / G2).
 *
 * Dedicated path avoids Medusa core `StoreGetProductsParams` rejecting
 * unrecognized query keys on `/store/products`.
 * G2: explicit allowlist browse DTO (not metadata denylist).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const key = browseCatalogCoalesceKey(
    req.query as Record<string, unknown> | undefined
  )
  const products = await coalesceBrowseCatalog(key, async () => {
    const loaded = await loadStoreProductList(req, { mode: "browse" })
    return projectBrowseProducts(loaded)
  })
  // Forensic / ops marker: proves this response went through merchandising sort.
  res.setHeader("x-woodright-catalog-order", "merchandising-v1")
  res.json({ products })
}
