import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const BESPOKE = "BESPOKE"

/** Collect variant ids from single-item and Medusa batch add-to-cart payloads. */
export function collectCartVariantIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const o = body as Record<string, unknown>
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return
    const id = raw.trim()
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }

  push(o.variant_id)
  if (Array.isArray(o.items)) {
    for (const item of o.items) {
      if (!item || typeof item !== "object") continue
      push((item as Record<string, unknown>).variant_id)
    }
  }
  return ids
}

const BESPOKE_CART_REJECTION = {
  message: "BESPOKE products cannot be added to cart. Use the quote request form instead.",
  code: "BESPOKE_NOT_ALLOWED_IN_CART",
} as const

const PRODUCT_TYPE_VALIDATION_FAILED = {
  message: "Unable to validate product type for cart operation.",
  code: "PRODUCT_TYPE_VALIDATION_FAILED",
} as const

/**
 * Блокирует добавление BESPOKE в корзину: проверка до вызова стандартного add-to-cart flow Medusa, без его дублирования.
 * Validates every variant in the payload; rejects the whole request if any line is BESPOKE.
 */
async function ensureNotBespokeForCart(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const variantIds = collectCartVariantIds(req.body)

  if (variantIds.length === 0) {
    return next()
  }

  let productModule
  let query: {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  try {
    productModule = req.scope.resolve(Modules.PRODUCT)
    query = req.scope.resolve("query")
  } catch {
    res.status(500).json(PRODUCT_TYPE_VALIDATION_FAILED)
    return
  }

  for (const variantId of variantIds) {
    let variant
    try {
      variant = await productModule.retrieveProductVariant(variantId)
    } catch {
      res.status(500).json(PRODUCT_TYPE_VALIDATION_FAILED)
      return
    }

    const productId = variant?.product_id
    if (!productId) {
      res.status(500).json(PRODUCT_TYPE_VALIDATION_FAILED)
      return
    }

    let products: unknown[] = []
    try {
      const result = await query.graph({
        entity: "product",
        fields: ["*", "product_classification.*"],
        filters: { id: productId },
      })
      products = result?.data ?? []
    } catch {
      res.status(500).json(PRODUCT_TYPE_VALIDATION_FAILED)
      return
    }

    const product = products?.[0] as { product_classification?: { product_type?: string } } | undefined
    const productType = product?.product_classification?.product_type

    if (productType === BESPOKE) {
      res.status(400).json(BESPOKE_CART_REJECTION)
      return
    }
  }

  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/carts/:id/line-items",
      method: ["POST"],
      middlewares: [ensureNotBespokeForCart],
    },
  ],
})
