import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["*", "variants.*", "variants.prices.*", "images.*", "product_classification.*", "categories.*"],
    filters: { status: "published" },
  })

  res.json({ products: products ?? [] })
}
