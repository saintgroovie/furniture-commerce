import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Список продуктов store. Оркестрация query в route — явное MVP-исключение (см. development-rules.md).
 * category_id: фильтр зависит от имени связи product ↔ category в текущей версии Medusa; при другом имени связи фильтрация по категории может не срабатывать (MVP-ограничение).
 * product_type: in-memory, т.к. productClassification — linked entity.
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
  const handle = (req.query.handle as string) || undefined

  const filters: Record<string, unknown> = { status: "published" }
  if (handle) filters.handle = handle
  const fields =
    productType || categoryId
      ? ["*", "variants.*", "variants.price_set.prices.amount", "images.*", "product_categories.*", "product_classification.*"]
      : [
          "id",
          "handle",
          "title",
          "status",
          "thumbnail",
          "metadata",
          "variants.id",
          "variants.price_set.prices.amount",
          "images.url",
          "product_classification.product_type",
        ]
  const { data: products } = await query.graph({
    entity: "product",
    fields,
    filters: Object.keys(filters).length ? filters : undefined,
  })

  let result = (products ?? []) as Array<Record<string, unknown>>
  result = result.map((p) => {
    const variants = p.variants as
      | Array<Record<string, unknown> & { price_set?: { prices?: unknown[] } }>
      | undefined
    if (!Array.isArray(variants)) return p
    return {
      ...p,
      variants: variants.map((variant) =>
        !variant.prices && variant.price_set?.prices
          ? { ...variant, prices: variant.price_set.prices }
          : variant
      ),
    }
  })
  if (categoryId) {
    result = result.filter((p) => {
      const pcs = p.product_categories as Array<{ category_id?: string }> | undefined
      return Array.isArray(pcs) && pcs.some((pc) => pc.category_id === categoryId)
    })
  }
  if (productType) {
    result = result.filter(
      (p) =>
        (p.product_classification as Record<string, string> | undefined)?.product_type ===
        productType
    )
  }

  res.json({ products: result })
}
