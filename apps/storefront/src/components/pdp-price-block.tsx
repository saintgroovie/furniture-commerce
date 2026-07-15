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

type Props = {
  /** Preformatted price label from server (existing getPrice / request-quote). */
  priceLabel: string | null
  /**
   * Numeric solid_full base (Medusa variant RUB). Used with material × color
   * multipliers so the shown price matches the cart line formula.
   */
  basePrice?: number | null
  /**
   * When true, hide price only for an unavailable combination. Defaults
   * (LDSP + first/standard color) show immediately — including SSR before the
   * gallery publishes the gate.
   */
  requiresBuyerSelection: boolean
  /** Product handle/id — rejects a stale gate from a previous PDP. */
  productKey: string
  /**
   * Ordered material tier options (position 0 = default / lowest). When present
   * the shown price follows the tier picked in the material dropdown.
   */
  materialTiers?: MaterialTierOption[] | null
  /** request_quote products keep the «от … ₽» reference-price shape. */
  requestQuote?: boolean
}

/**
 * Price under option groups. Defaults (LDSP + first/standard color) show the
 * lowest configured price immediately; switching material or color updates live.
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

  if (basePrice != null && Number.isFinite(basePrice) && basePrice > 0) {
    let materialMultiplier = 1
    if (materialTiers && materialTiers.length > 0) {
      const code = materialCodeForProduct(materialSelection, productKey)
      const tier = materialTiers.find((t) => t.code === code) ?? materialTiers[0]
      materialMultiplier = tier.multiplier
    }
    const amount = resolveConfiguredUnitPrice(
      basePrice,
      materialMultiplier,
      colorMultiplier
    )
    effectiveLabel = requestQuote ? `от ${formatRub(amount)}` : formatRub(amount)
  } else if (materialTiers && materialTiers.length > 0) {
    const code = materialCodeForProduct(materialSelection, productKey)
    const tier = materialTiers.find((t) => t.code === code) ?? materialTiers[0]
    if (tier.price != null) {
      const amount =
        colorMultiplier === 1
          ? tier.price
          : Math.round(tier.price * colorMultiplier)
      effectiveLabel = requestQuote ? `от ${formatRub(amount)}` : formatRub(amount)
    }
  }

  const showPrice =
    Boolean(effectiveLabel) && !combinationUnavailable && !selectionIncomplete

  const hint =
    !showPrice && requiresBuyerSelection
      ? combinationUnavailable
        ? "Такое сочетание недоступно"
        : gateOk && gate.requiresSelection
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
