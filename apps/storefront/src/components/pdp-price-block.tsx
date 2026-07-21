"use client"

import {
  usePdpPurchaseGate,
  pdpPriceHintForGate,
  gateMatchesProduct,
} from "@/lib/cart/pdp-selection"
import {
  materialCodeForProduct,
  usePdpMaterialSelection,
} from "@/lib/cart/pdp-material-selection"
import type { MaterialTierOption } from "@/lib/material-tiers"
import {
  resolveConfiguredUnitPrice,
  resolveFinishColorMultiplier,
} from "@/lib/finish-color-premium"
import { formatRub } from "@/lib/format"
import { pdpCopy } from "@/lib/woodright-copy"

type Props = {
  /** Preformatted price label from server (existing getPrice / request-quote). */
  priceLabel: string | null
  /**
   * Numeric solid_full base (Medusa variant RUB). Used with material × color
   * multipliers so the shown price matches the cart line formula.
   */
  basePrice?: number | null
  /**
   * When true, hide price only for an unavailable combination. Material tier
   * and gallery picks must be explicit before a price is shown.
   */
  requiresBuyerSelection: boolean
  /** Product handle/id — rejects a stale gate from a previous PDP. */
  productKey: string
  /**
   * Ordered material tier options. The shown price follows an explicit tier
   * pick in the material dropdown — no default tier fallback.
   */
  materialTiers?: MaterialTierOption[] | null
  /** request_quote products keep the «от … ₽» reference-price shape. */
  requestQuote?: boolean
}

/**
 * Price under option groups. Material tier and execution picks must be
 * confirmed before an exact price is shown.
 */
export function PdpPriceBlock({
  priceLabel,
  basePrice = null,
  requiresBuyerSelection,
  productKey,
  materialTiers = null,
  requestQuote = false,
}: Props) {
  const gate = usePdpPurchaseGate()
  const gateOk = gateMatchesProduct(gate, productKey)
  const materialSelection = usePdpMaterialSelection()

  const materialCode = materialCodeForProduct(materialSelection, productKey)
  const materialIncomplete =
    Boolean(materialTiers?.length) && !materialCode

  const combinationUnavailable =
    requiresBuyerSelection &&
    gateOk &&
    gate.requiresSelection &&
    gate.complete &&
    !gate.combinationAvailable

  const selectionIncomplete =
    requiresBuyerSelection &&
    gateOk &&
    gate.requiresSelection &&
    !gate.complete

  let effectiveLabel = priceLabel
  const colorMultiplier =
    gateOk
      ? resolveFinishColorMultiplier(gate.finishKey, gate.standardFinishKey)
      : 1

  if (
    basePrice != null &&
    Number.isFinite(basePrice) &&
    basePrice > 0 &&
    !materialIncomplete
  ) {
    let materialMultiplier = 1
    if (materialTiers && materialTiers.length > 0 && materialCode) {
      const tier = materialTiers.find((t) => t.code === materialCode)
      if (tier) materialMultiplier = tier.multiplier
    }
    const amount = resolveConfiguredUnitPrice(
      basePrice,
      materialMultiplier,
      colorMultiplier
    )
    effectiveLabel = requestQuote ? `от ${formatRub(amount)}` : formatRub(amount)
  } else if (
    materialTiers &&
    materialTiers.length > 0 &&
    materialCode &&
    !materialIncomplete
  ) {
    const tier = materialTiers.find((t) => t.code === materialCode)
    if (tier?.price != null) {
      const amount =
        colorMultiplier === 1
          ? tier.price
          : Math.round(tier.price * colorMultiplier)
      effectiveLabel = requestQuote ? `от ${formatRub(amount)}` : formatRub(amount)
    }
  } else if (materialIncomplete) {
    effectiveLabel = null
  }

  const showPrice =
    Boolean(effectiveLabel) &&
    !combinationUnavailable &&
    !selectionIncomplete &&
    !materialIncomplete

  const materialHint = `${pdpCopy.optionChooseValue} ${pdpCopy.materialTierLabel.toLowerCase()}`

  const hint = !showPrice
    ? combinationUnavailable
      ? "Такое сочетание недоступно"
      : materialIncomplete
        ? materialHint
        : requiresBuyerSelection && gateOk && gate.requiresSelection
          ? pdpPriceHintForGate(gate)
          : null
    : null

  return (
    <div className="pdp-price-area" aria-live="polite">
      {showPrice ? (
        <p className="price product-detail-price">{effectiveLabel}</p>
      ) : hint ? (
        <p className="pdp-price-hint">{hint}</p>
      ) : null}
    </div>
  )
}
