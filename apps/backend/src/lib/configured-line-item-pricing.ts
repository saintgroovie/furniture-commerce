/**
 * Pure configured line-item pricing (material × finish) for the store cart
 * route. Kept free of Medusa request types so unit tests can pin A1/B1 and
 * the shared rounding formula without spinning up HTTP.
 *
 * unit_price = round(solid_full_base × material_multiplier × color_multiplier)
 */

import {
  findMaterialTier,
  parseMaterialTiers,
  type MaterialTierEntry,
} from "./material-tier-contract"
import {
  finishLabelFromMetadata,
  isKnownFinishExecutionKey,
  resolveConfiguredUnitPrice,
  resolveFinishColorMultiplier,
} from "./finish-color-premium-contract"

export type ConfiguredPricingInput = {
  productMetadata: Record<string, unknown> | null | undefined
  /** Already-sanitized non-empty string, or null when omitted. */
  materialExecutionCode: string | null
  /** Already-sanitized non-empty string, or null when omitted. */
  finishExecutionKey: string | null
  /**
   * Medusa calculated_price.calculated_amount in cart currency/region
   * context. Null/invalid → VARIANT_PRICE_NOT_FOUND (A1: no raw prices[]).
   */
  calculatedBaseAmount: number | null
  /**
   * Incoming metadata after server-owned keys were stripped. This helper
   * rewrites authoritative material/finish fields onto a shallow copy.
   */
  metadata: Record<string, unknown>
}

export type ConfiguredPricingOk = {
  ok: true
  /** True when material and/or finish configuration applies. */
  needsConfiguredPricing: boolean
  unitPrice: number | undefined
  metadata: Record<string, unknown>
  materialMultiplier: number
  colorMultiplier: number
  resolved: number | null
}

export type ConfiguredPricingErr = {
  ok: false
  status: 400
  code:
    | "MATERIAL_EXECUTION_REQUIRED"
    | "UNKNOWN_MATERIAL_EXECUTION"
    | "UNKNOWN_FINISH_EXECUTION"
    | "VARIANT_PRICE_NOT_FOUND"
  message: string
}

export type ConfiguredPricingResult = ConfiguredPricingOk | ConfiguredPricingErr

/**
 * Resolve configured unit price + authoritative metadata for a line item.
 * Returns early errors for B1 (missing material code when tiers exist) and
 * A1 (missing calculated_price on the configured path).
 */
export function resolveConfiguredLineItemPricing(
  input: ConfiguredPricingInput
): ConfiguredPricingResult {
  const tiers = parseMaterialTiers(input.productMetadata)
  const hasTiers = Boolean(tiers && tiers.length > 0)
  const executionCode = input.materialExecutionCode
  const finishKey = input.finishExecutionKey
  const metadata = { ...input.metadata }

  if (hasTiers && !executionCode) {
    return {
      ok: false,
      status: 400,
      code: "MATERIAL_EXECUTION_REQUIRED",
      message:
        "material_execution_code is required for products with material tiers.",
    }
  }

  const needsConfiguredPricing = Boolean(executionCode) || Boolean(finishKey)
  if (!needsConfiguredPricing) {
    return {
      ok: true,
      needsConfiguredPricing: false,
      unitPrice: undefined,
      metadata,
      materialMultiplier: 1,
      colorMultiplier: 1,
      resolved: null,
    }
  }

  let materialMultiplier = 1
  if (executionCode) {
    const tier = tiers ? findMaterialTier(tiers, executionCode) : null
    if (!tier) {
      return {
        ok: false,
        status: 400,
        code: "UNKNOWN_MATERIAL_EXECUTION",
        message: `Unknown material execution "${executionCode}" for this product.`,
      }
    }
    materialMultiplier = tier.price_multiplier
    metadata.material_execution_code = tier.key
    metadata.material_execution_label = tier.label_ru
    metadata.material_price_multiplier = tier.price_multiplier
  }

  let colorMultiplier = 1
  if (finishKey) {
    if (!isKnownFinishExecutionKey(input.productMetadata, finishKey)) {
      return {
        ok: false,
        status: 400,
        code: "UNKNOWN_FINISH_EXECUTION",
        message: `Unknown finish execution "${finishKey}" for this product.`,
      }
    }
    colorMultiplier = resolveFinishColorMultiplier(
      input.productMetadata,
      finishKey
    )
    metadata.finish_execution_key = finishKey
    metadata.finish_color_multiplier = colorMultiplier
    const finishLabel = finishLabelFromMetadata(input.productMetadata, finishKey)
    if (finishLabel) metadata.finish_execution_label = finishLabel
  }

  const baseAmount = input.calculatedBaseAmount
  if (
    baseAmount == null ||
    !Number.isFinite(baseAmount) ||
    baseAmount <= 0
  ) {
    return {
      ok: false,
      status: 400,
      code: "VARIANT_PRICE_NOT_FOUND",
      message: "Variant has no calculated price for this cart.",
    }
  }

  const resolved = resolveConfiguredUnitPrice(
    baseAmount,
    materialMultiplier,
    colorMultiplier
  )
  metadata.resolved_unit_price = resolved
  const unitPrice = resolved !== baseAmount ? resolved : undefined

  return {
    ok: true,
    needsConfiguredPricing: true,
    unitPrice,
    metadata,
    materialMultiplier,
    colorMultiplier,
    resolved,
  }
}

/** Test helper: canonical two-tier metadata fixture. */
export function fixtureMaterialTiersMetadata(
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  const tiers: Record<string, MaterialTierEntry> = {
    solid_front_ldsp_body: {
      key: "solid_front_ldsp_body",
      label_ru: "Фасады из массива + корпус ЛДСП",
      description_ru: "Практичное исполнение с фасадами из натурального массива",
      price_multiplier: 0.7,
      position: 0,
    },
    solid_full: {
      key: "solid_full",
      label_ru: "Полностью из массива",
      description_ru: "Премиальное исполнение полностью из натурального массива",
      price_multiplier: 1,
      position: 1,
    },
  }
  return { material_tiers: tiers, ...extras }
}
