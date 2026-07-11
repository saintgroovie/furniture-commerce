import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const BESPOKE = "BESPOKE"

/**
 * Блокирует добавление BESPOKE в корзину: проверка до вызова стандартного add-to-cart flow Medusa, без его дублирования.
 */
async function ensureNotBespokeForCart(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const variantId =
    req.body?.variant_id ?? req.body?.items?.[0]?.variant_id

  if (!variantId) {
    return next()
  }

  let variant
  let products: unknown[] = []
  try {
    const productModule = req.scope.resolve(Modules.PRODUCT)
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

  try {
    const query = req.scope.resolve("query") as {
      graph: (args: {
        entity: string
        fields: string[]
        filters?: Record<string, unknown>
      }) => Promise<{ data: unknown[] }>
    }
    const result = await query.graph({
      entity: "product",
      fields: ["*", "product_classification.*"],
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
  const productType = product?.product_classification?.product_type

  if (productType === BESPOKE) {
    res.status(400).json({
      message: "BESPOKE products cannot be added to cart. Use the quote request form instead.",
      code: "BESPOKE_NOT_ALLOWED_IN_CART",
    })
    return
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
