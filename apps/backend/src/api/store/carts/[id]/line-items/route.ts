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
 *   (omitted code → position 0 / LDSP when tiers exist)
 * - color_multiplier: 1 for the first (standard) finish, 1.05 otherwise
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

type VariantPriceRow = {
  amount?: number | string | null
  currency_code?: string | null
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

function resolveBaseAmount(
  variant: {
    calculated_price?: { calculated_amount?: number | string | null }
    prices?: VariantPriceRow[]
  },
  currencyCode: string | undefined
): { amount: number; usedPriceFallback: boolean } | null {
  const calculated = Number(variant.calculated_price?.calculated_amount)
  if (Number.isFinite(calculated) && calculated > 0) {
    return { amount: calculated, usedPriceFallback: false }
  }
  const prices = Array.isArray(variant.prices) ? variant.prices : []
  const currency = typeof currencyCode === "string" ? currencyCode.trim().toLowerCase() : ""
  const matched =
    (currency
      ? prices.find(
          (p) =>
            typeof p.currency_code === "string" &&
            p.currency_code.trim().toLowerCase() === currency
        )
      : undefined) ?? prices[0]
  const fallback = Number(matched?.amount)
  if (Number.isFinite(fallback) && fallback > 0) {
    return { amount: fallback, usedPriceFallback: true }
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
      "prices.amount",
      "prices.currency_code",
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
        prices?: VariantPriceRow[]
      }
    | undefined
  if (!variant) {
    res.status(400).json({ message: "Variant not found.", code: "INVALID_LINE_ITEM" })
    return
  }

  const productMeta = variant.product?.metadata
  const tiers = parseMaterialTiers(productMeta)
  const needsConfiguredPricing = Boolean(tiers) || Boolean(executionCode) || Boolean(finishKey)

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
    } else if (tiers && tiers.length > 0) {
      /* Product rule: lowest default = position 0 (LDSP) when material omitted. */
      const tier = tiers[0]
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

    const base = resolveBaseAmount(variant, cart.currency_code)
    if (!base) {
      res.status(400).json({
        message: "Variant has no calculated price for this cart.",
        code: "VARIANT_PRICE_NOT_FOUND",
      })
      return
    }

    const resolved = resolveConfiguredUnitPrice(
      base.amount,
      materialMultiplier,
      colorMultiplier
    )
    metadata.resolved_unit_price = resolved
    /* Always pin unit_price on the configured path so Medusa cannot replace a
       missing calculated_price with a different amount after fallback. */
    if (base.usedPriceFallback || resolved !== base.amount) {
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
