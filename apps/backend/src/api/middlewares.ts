import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { evaluateCartClassificationGate } from "./cart-classification-gate"
import { attachRuntimeIdentityHeaders } from "./runtime-identity-headers"

/**
 * Блокирует добавление BESPOKE в корзину: проверка до вызова стандартного add-to-cart flow Medusa, без его дублирования.
 * Fail-closed: missing product or missing classification → 500 (never silent allow).
 */
async function ensureNotBespokeForCart(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const body = req.body as {
    variant_id?: string
    items?: Array<{ variant_id?: string }>
  }
  const variantIds = new Set<string>()
  if (body?.variant_id) variantIds.add(body.variant_id)
  for (const item of body?.items ?? []) {
    if (item?.variant_id) variantIds.add(item.variant_id)
  }

  if (variantIds.size === 0) {
    return next()
  }

  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }
  const productModule = req.scope.resolve(Modules.PRODUCT)

  for (const variantId of variantIds) {
    let variant
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
    const gate = evaluateCartClassificationGate(product)
    if (!gate.allow) {
      if (gate.code === "BESPOKE_NOT_ALLOWED_IN_CART") {
        res.status(gate.status).json({
          message:
            "BESPOKE products cannot be added to cart. Use the quote request form instead.",
          code: gate.code,
        })
        return
      }
      res.status(gate.status).json({
        message: "Unable to validate product type for cart operation.",
        code: gate.code,
      })
      return
    }
  }

  next()
}

export default defineMiddlewares({
  routes: [
    {
      // Runtime identity for QA / release governance (env-driven; no secrets).
      matcher: "/store*",
      middlewares: [attachRuntimeIdentityHeaders],
    },
    {
      matcher: "/health",
      middlewares: [attachRuntimeIdentityHeaders],
    },
    {
      matcher: "/store/carts/:id/line-items",
      method: ["POST"],
      middlewares: [ensureNotBespokeForCart],
    },
  ],
})
