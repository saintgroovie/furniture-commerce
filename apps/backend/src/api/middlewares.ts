import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { evaluateCartSalesGate } from "../lib/woodright-sales/cart-sales-gate"
import { buildBuyerPurchaseContract } from "../lib/woodright-sales/buyer-purchase-contract"
import {
  buildSalesSnapshot,
  stripClientSalesSnapshot,
  type WoodrightSalesSnapshotV1,
} from "../lib/woodright-sales/sales-snapshot"
import type { SalesMode, SalesModifier } from "../lib/woodright-sales/sales-modes"
import { resolveFurnitureDimensions } from "../lib/woodright-dimensions"
import { attachRuntimeIdentityHeaders } from "./runtime-identity-headers"

/**
 * Cart add gate: classification fail-closed + sales policy when present.
 * Preserves BESPOKE_NOT_ALLOWED_IN_CART / PRODUCT_TYPE_VALIDATION_FAILED.
 * evaluateCartClassificationGate remains exported for legacy fidelity tests.
 */
async function ensureNotBespokeForCart(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const body = req.body as {
    variant_id?: string
    metadata?: Record<string, unknown>
    items?: Array<{ variant_id?: string; metadata?: Record<string, unknown> }>
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
  const snapshotsByVariant = new Map<string, WoodrightSalesSnapshotV1>()

  for (const variantId of variantIds) {
    let variant: {
      product_id?: string
      metadata?: Record<string, unknown> | null
    }
    try {
      variant = (await productModule.retrieveProductVariant(variantId)) as {
        product_id?: string
        metadata?: Record<string, unknown> | null
      }
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
        fields: [
          "id",
          "metadata",
          "product_classification.product_type",
          "product_sales_policy.*",
        ],
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
      | {
          metadata?: Record<string, unknown> | null
          product_classification?: { product_type?: string }
          product_sales_policy?:
            | {
                sales_mode?: SalesMode
                modifiers?: SalesModifier[] | null
              }
            | Array<{
                sales_mode?: SalesMode
                modifiers?: SalesModifier[] | null
              }>
            | null
        }
      | undefined

    const classification = product?.product_classification?.product_type
    const rawPolicy = product?.product_sales_policy
    const policy = Array.isArray(rawPolicy) ? rawPolicy[0] : rawPolicy

    const gate = evaluateCartSalesGate({
      classification,
      sales_mode: policy?.sales_mode ?? null,
      modifiers: (policy?.modifiers as SalesModifier[] | undefined) ?? undefined,
    })

    if (!gate.allow) {
      if (gate.code === "BESPOKE_NOT_ALLOWED_IN_CART") {
        res.status(gate.status).json({
          message:
            "BESPOKE products cannot be added to cart. Use the quote request form instead.",
          code: gate.code,
        })
        return
      }
      if (gate.code === "PRODUCT_TYPE_VALIDATION_FAILED") {
        res.status(gate.status).json({
          message: "Unable to validate product type for cart operation.",
          code: gate.code,
        })
        return
      }
      res.status(gate.status).json({
        message: gate.message,
        code: gate.code,
      })
      return
    }

    const contract = buildBuyerPurchaseContract({
      sales_mode: policy?.sales_mode ?? null,
      modifiers: (policy?.modifiers as SalesModifier[] | undefined) ?? undefined,
      classification: classification as "STANDARD" | "CONFIGURABLE" | "BESPOKE",
    })
    const dims = resolveFurnitureDimensions({
      product: { metadata: product?.metadata ?? null },
      variant: { metadata: variant?.metadata ?? null },
    })
    snapshotsByVariant.set(
      variantId,
      buildSalesSnapshot({
        contract,
        dimensions: dims.mm,
      })
    )
  }

  // Attach per-variant snapshots only (no cross-item overwrite).
  // Medusa may expose a validatedBody clone; mutate both so the line-items
  // override (which prefers validatedBody) keeps the server snapshot.
  const attachSnapshot = (target: {
    variant_id?: string
    metadata?: Record<string, unknown>
    items?: Array<{ variant_id?: string; metadata?: Record<string, unknown> }>
  }) => {
    if (target.variant_id && snapshotsByVariant.has(target.variant_id)) {
      target.metadata = {
        ...stripClientSalesSnapshot(target.metadata),
        woodright_sales_snapshot: snapshotsByVariant.get(target.variant_id),
      }
    }
    if (Array.isArray(target.items)) {
      target.items = target.items.map((item) => {
        const vid = item.variant_id
        const snap = vid ? snapshotsByVariant.get(vid) : undefined
        if (!snap) return item
        return {
          ...item,
          metadata: {
            ...stripClientSalesSnapshot(item.metadata),
            woodright_sales_snapshot: snap,
          },
        }
      })
    }
  }

  attachSnapshot(body)
  const validated = (req as { validatedBody?: typeof body }).validatedBody
  if (validated && validated !== body) {
    attachSnapshot(validated)
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
