import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadStoreProductList } from "./load-store-product-list"

/**
 * Список продуктов store. Оркестрация query в route — явное MVP-исключение (см. development-rules.md).
 * category_id: фильтр зависит от имени связи product ↔ category в текущей версии Medusa; при другом имени связи фильтрация по категории может не срабатывать (MVP-ограничение).
 * product_type: in-memory via linked ProductClassification (`product_classification`).
 * Catalog listing projection: GET /store/catalog-products (PERF-02 / G1).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const products = await loadStoreProductList(req)
  res.json({ products })
}
