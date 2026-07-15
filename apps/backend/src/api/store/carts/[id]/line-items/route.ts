import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addToCartWorkflow } from "@medusajs/core-flows"
import { QueryContext } from "@medusajs/framework/utils"
import { resolveConfiguredLineItemPricing } from "../../../../../lib/configured-line-item-pricing"

/**
 * Override of the core POST /store/carts/:id/line-items route.
 *
 * Configured unit price (material tiers and/or finish premium):
 *   round(solid_full_base × material_multiplier × color_multiplier)
 *
 * - material_multiplier from `product.metadata.material_tiers`
 *   (code required when tiers exist — no silent LDSP default)
 * - color_multiplier: 1 for the first (standard) finish, 1.05 otherwise
 * - base amount must come from Medusa `calculated_price` in cart
 *   currency/region context — raw `prices[]` is never used
 *
 * Client-sent label / multiplier / resolved price values are discarded and
 * rewritten with authoritative ones. Products without material tiers and
 * without a finish key keep the default Medusa pricing path.
 *
 * The BESPOKE cart guard from src/api/middlewares.ts still runs before this
 * handler; core body validation (StoreAddCartLineItem) also still applies.
 */

type AddLineItemBody = {
  variant_id?: string
  quantity?: number
  metadata?: Record<string, unknown> | null
  additional_data?: Record<string, unknown>
}

type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
    context?: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

const CART_RESPONSE_FALLBACK_FIELDS = [
  "id",
  "currency_code",
  "email",
  "region_id",
  "total",
  "subtotal",
  "item_total",
  "items.*",
  "items.metadata",
]

function resolveCalculatedBaseAmount(variant: {
  calculated_price?: { calculated_amount?: number | string | null }
}): number | null {
  const calculated = Number(variant.calculated_price?.calculated_amount)
  if (Number.isFinite(calculated) && calculated > 0) {
    return calculated
  }
  return null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const cartId = req.params.id as string
  const body = ((req as { validatedBody?: AddLineItemBody }).validatedBody ??
    req.body ??
    {}) as AddLineItemBody

  const variantId = typeof body.variant_id === "string" ? body.variant_id : ""
  const quantity = Number(body.quantity)
  if (!variantId || !Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({
      message: "variant_id and a positive quantity are required.",
      code: "INVALID_LINE_ITEM",
    })
    return
  }

  const metadata: Record<string, unknown> =
    body.metadata != null && typeof body.metadata === "object"
      ? { ...body.metadata }
      : {}
  // Server-owned keys: never trust client-provided values for these.
  delete metadata.material_execution_label
  delete metadata.material_price_multiplier
  delete metadata.finish_color_multiplier
  delete metadata.finish_execution_label
  delete metadata.resolved_unit_price

  const executionCode =
    typeof metadata.material_execution_code === "string" &&
    metadata.material_execution_code.trim()
      ? metadata.material_execution_code.trim()
      : null
  const finishKey =
    typeof metadata.finish_execution_key === "string" &&
    metadata.finish_execution_key.trim()
      ? metadata.finish_execution_key.trim()
      : null
  /* Non-string / empty values in the server-owned namespace never pass through. */
  if (!executionCode) delete metadata.material_execution_code
  if (!finishKey) delete metadata.finish_execution_key

  const query = req.scope.resolve("query") as QueryGraph

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "currency_code", "region_id"],
    filters: { id: cartId },
  })
  const cart = carts?.[0] as
    | { currency_code?: string; region_id?: string }
    | undefined
  if (!cart) {
    res.status(404).json({ message: `Cart ${cartId} not found`, code: "CART_NOT_FOUND" })
    return
  }

  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "product.id",
      "product.metadata",
      "calculated_price.*",
    ],
    filters: { id: variantId },
    context: {
      calculated_price: QueryContext({
        currency_code: cart.currency_code,
        region_id: cart.region_id,
      }),
    },
  })
  const variant = variants?.[0] as
    | {
        product?: { metadata?: Record<string, unknown> }
        calculated_price?: { calculated_amount?: number | string | null }
      }
    | undefined
  if (!variant) {
    res.status(400).json({ message: "Variant not found.", code: "INVALID_LINE_ITEM" })
    return
  }

  const priced = resolveConfiguredLineItemPricing({
    productMetadata: variant.product?.metadata,
    materialExecutionCode: executionCode,
    finishExecutionKey: finishKey,
    calculatedBaseAmount: resolveCalculatedBaseAmount(variant),
    metadata,
  })
  if (!priced.ok) {
    res.status(priced.status).json({
      message: priced.message,
      code: priced.code,
    })
    return
  }

  await addToCartWorkflow(req.scope).run({
    input: {
      cart_id: cartId,
      items: [
        {
          variant_id: variantId,
          quantity,
          ...(Object.keys(priced.metadata).length > 0
            ? { metadata: priced.metadata }
            : {}),
          ...(priced.unitPrice != null ? { unit_price: priced.unitPrice } : {}),
        },
      ],
      // Same contract as the core route: workflow hooks receive additional_data.
      additional_data: body.additional_data,
    },
  })

  const fields =
    (req as { queryConfig?: { fields?: string[] } }).queryConfig?.fields ??
    CART_RESPONSE_FALLBACK_FIELDS
  const { data: refreshed } = await query.graph({
    entity: "cart",
    fields,
    filters: { id: cartId },
  })
  const refreshedCart = refreshed?.[0]
  if (!refreshedCart) {
    res.status(404).json({ message: `Cart ${cartId} not found`, code: "CART_NOT_FOUND" })
    return
  }
  res.status(200).json({ cart: refreshedCart })
}
