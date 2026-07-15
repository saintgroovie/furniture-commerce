import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addToCartWorkflow } from "@medusajs/core-flows"
import { QueryContext } from "@medusajs/framework/utils"
import {
  findMaterialTier,
  parseMaterialTiers,
} from "../../../../../lib/material-tier-contract"
import {
  resolveConfiguredUnitPrice,
  resolveFinishColorMultiplier,
  finishLabelFromMetadata,
  isKnownFinishExecutionKey,
} from "../../../../../lib/finish-color-premium-contract"

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
  let unitPrice: number | undefined

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

  const productMeta = variant.product?.metadata
  const tiers = parseMaterialTiers(productMeta)
  const hasTiers = Boolean(tiers && tiers.length > 0)

  /* B1: products with material_tiers require an explicit execution code.
     No silent LDSP default — legacy clients must send material_execution_code. */
  if (hasTiers && !executionCode) {
    res.status(400).json({
      message:
        "material_execution_code is required for products with material tiers.",
      code: "MATERIAL_EXECUTION_REQUIRED",
    })
    return
  }

  const needsConfiguredPricing =
    Boolean(executionCode) || Boolean(finishKey)

  if (needsConfiguredPricing) {
    let materialMultiplier = 1
    if (executionCode) {
      const tier = tiers ? findMaterialTier(tiers, executionCode) : null
      if (!tier) {
        res.status(400).json({
          message: `Unknown material execution "${executionCode}" for this product.`,
          code: "UNKNOWN_MATERIAL_EXECUTION",
        })
        return
      }
      materialMultiplier = tier.price_multiplier
      metadata.material_execution_code = tier.key
      metadata.material_execution_label = tier.label_ru
      metadata.material_price_multiplier = tier.price_multiplier
    }

    let colorMultiplier = 1
    if (finishKey) {
      if (!isKnownFinishExecutionKey(productMeta, finishKey)) {
        res.status(400).json({
          message: `Unknown finish execution "${finishKey}" for this product.`,
          code: "UNKNOWN_FINISH_EXECUTION",
        })
        return
      }
      colorMultiplier = resolveFinishColorMultiplier(productMeta, finishKey)
      metadata.finish_execution_key = finishKey
      metadata.finish_color_multiplier = colorMultiplier
      const finishLabel = finishLabelFromMetadata(productMeta, finishKey)
      if (finishLabel) metadata.finish_execution_label = finishLabel
    }

    /* A1: only Medusa calculated_price in cart currency/region context. */
    const baseAmount = resolveCalculatedBaseAmount(variant)
    if (baseAmount == null) {
      res.status(400).json({
        message: "Variant has no calculated price for this cart.",
        code: "VARIANT_PRICE_NOT_FOUND",
      })
      return
    }

    const resolved = resolveConfiguredUnitPrice(
      baseAmount,
      materialMultiplier,
      colorMultiplier
    )
    metadata.resolved_unit_price = resolved
    if (resolved !== baseAmount) {
      unitPrice = resolved
    }
  }

  await addToCartWorkflow(req.scope).run({
    input: {
      cart_id: cartId,
      items: [
        {
          variant_id: variantId,
          quantity,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
          ...(unitPrice != null ? { unit_price: unitPrice } : {}),
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
