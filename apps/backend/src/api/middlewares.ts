import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  BESPOKE,
  collectVariantIdsFromCartBody,
  decideCartClassification,
} from "./store/cart-classification-gate"

/**
 * Blocks BESPOKE (and unclassified) products from cart before Medusa add-to-cart.
 * Fail-closed on missing/malformed product_classification.
 */
async function ensureNotBespokeForCart(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const variantIds = collectVariantIdsFromCartBody(req.body)
  if (variantIds.length === 0) {
    return next()
  }

  let productModule: {
    retrieveProductVariant: (
      id: string
    ) => Promise<{ product_id?: string | null }>
  }
  let query: {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  try {
    productModule = req.scope.resolve(Modules.PRODUCT) as typeof productModule
    query = req.scope.resolve("query") as typeof query
  } catch {
    res.status(500).json({
      message: "Unable to validate product type for cart operation.",
      code: "PRODUCT_TYPE_VALIDATION_FAILED",
    })
    return
  }

  for (const variantId of variantIds) {
    let variant: { product_id?: string | null }
    try {
      variant = await productModule.retrieveProductVariant(variantId)
    } catch {
      res.status(500).json({
        message: "Unable to validate product type for cart operation.",
        code: "PRODUCT_TYPE_VALIDATION_FAILED",
      })
      return
    }

    const productId = variant?.product_id
    if (!productId) {
      res.status(500).json({
        message: "Unable to validate product type for cart operation.",
        code: "PRODUCT_TYPE_VALIDATION_FAILED",
      })
      return
    }

    let products: unknown[] = []
    try {
      const result = await query.graph({
        entity: "product",
        fields: ["id", "product_classification.product_type"],
        filters: { id: productId },
      })
      products = result?.data ?? []
    } catch {
      res.status(500).json({
        message: "Unable to validate product type for cart operation.",
        code: "PRODUCT_TYPE_VALIDATION_FAILED",
      })
      return
    }

    const product = products?.[0] as
      | { product_classification?: { product_type?: string } }
      | undefined
    const decision = decideCartClassification({
      productFound: Boolean(product),
      product_type: product?.product_classification?.product_type,
    })

    if (decision.kind === "block_bespoke") {
      res.status(400).json({
        message:
          "BESPOKE products cannot be added to cart. Use the quote request form instead.",
        code: "BESPOKE_NOT_ALLOWED_IN_CART",
      })
      return
    }

    if (decision.kind === "reject") {
      res.status(decision.httpStatus).json({
        message: decision.message,
        code: decision.code,
      })
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

// Re-export for tests / clarity
export { BESPOKE, ensureNotBespokeForCart }
