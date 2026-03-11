import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Список продуктов store. Оркестрация query в route — явное MVP-исключение (см. development-rules.md).
 * category_id: фильтр зависит от имени связи product ↔ category в текущей версии Medusa; при другом имени связи фильтрация по категории может не срабатывать (MVP-ограничение).
 * product_type: in-memory, т.к. productType — linked entity.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }
  const productType = (req.query.product_type as string) || undefined
  const categoryId = (req.query.category_id as string) || undefined

  const filters: Record<string, unknown> = { status: "published" }
  const fields = ["*", "variants.*", "images.*", "productType.*", "product_categories.*"]
  const { data: products } = await query.graph({
    entity: "product",
    fields,
    filters: Object.keys(filters).length ? filters : undefined,
  })

  let result = (products ?? []) as Array<Record<string, unknown>>
  if (categoryId) {
    result = result.filter((p) => {
      const pcs = p.product_categories as Array<{ category_id?: string }> | undefined
      return Array.isArray(pcs) && pcs.some((pc) => pc.category_id === categoryId)
    })
  }
  if (productType) {
    result = result.filter(
      (p) => (p.productType as Record<string, string>)?.product_type === productType
    )
  }

  res.json({ products: result })
}
