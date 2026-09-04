import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  applyDimensionsToMetadata,
  isDimensionsCommandFailure,
  parseDimensionsBody,
} from "../../../../../../lib/woodright-admin/dimensions-command"

type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

type ProductModule = {
  updateProducts: (
    id: string,
    data: { metadata: Record<string, unknown> }
  ) => Promise<unknown>
}

/**
 * Seller dimensions write. Payload is centimetres; storage is millimetres.
 * POST /admin/woodright/products/:id/dimensions
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const parsed = parseDimensionsBody(req.body)
  if (isDimensionsCommandFailure(parsed)) {
    res.status(400).json({ message: parsed.message })
    return
  }

  const query = req.scope.resolve("query") as QueryGraph
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id },
  })
  const product = data?.[0] as { id?: string; metadata?: Record<string, unknown> } | undefined
  if (!product?.id) {
    res.status(404).json({ message: "Товар не найден" })
    return
  }

  const applied = applyDimensionsToMetadata(product.metadata ?? {}, parsed)
  if (isDimensionsCommandFailure(applied)) {
    res.status(400).json({ message: applied.message })
    return
  }

  const productModule = req.scope.resolve(Modules.PRODUCT) as ProductModule
  await productModule.updateProducts(product.id, { metadata: applied.metadata })

  res.json({
    id: product.id,
    dimensions: applied.mm,
  })
}
