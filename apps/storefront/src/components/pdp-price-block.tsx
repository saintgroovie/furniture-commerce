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
import { formatRub } from "@/lib/format"

type Props = {
  /** Preformatted price label from server (existing getPrice / request-quote). */
  priceLabel: string | null
  /**
   * When true, numeric price stays hidden until the gallery publishes a complete
   * valid selection. Server prop avoids a first-paint flash before publish.
   */
  requiresBuyerSelection: boolean
  /** Product handle/id — rejects a stale gate from a previous PDP. */
  productKey: string
  /**
   * Ordered material tier options (position 0 = default). When present the
   * shown price follows the tier picked in the material dropdown; prices are
   * backend-derived (metadata multiplier × the single variant RUB price).
   */
  materialTiers?: MaterialTierOption[] | null
  /** request_quote products keep the «от … ₽» reference-price shape. */
  requestQuote?: boolean
}

/**
 * Reserved price area under option groups. Hides the numeric price until every
 * required execution is confirmed; never invents a frontend price table.
 */
export function PdpPriceBlock({
  priceLabel,
  requiresBuyerSelection,
  productKey,
  materialTiers = null,
  requestQuote = false,
}: Props) {
  const gate = usePdpPurchaseGate()
  const gateOk = gateMatchesProduct(gate, productKey)
  const materialSelection = usePdpMaterialSelection()

  const selectionReady =
    gateOk &&
    gate.requiresSelection &&
    gate.complete &&
    gate.combinationAvailable

  /* Material tier price: default = first option, so the price is visible
     immediately (no «select first» empty state for the material axis). */
  let effectiveLabel = priceLabel
  if (materialTiers && materialTiers.length > 0) {
    const code = materialCodeForProduct(materialSelection, productKey)
    const tier = materialTiers.find((t) => t.code === code) ?? materialTiers[0]
    if (tier.price != null) {
      effectiveLabel = requestQuote ? `от ${formatRub(tier.price)}` : formatRub(tier.price)
    }
  }

  const showPrice = Boolean(effectiveLabel) && (
    requiresBuyerSelection ? selectionReady : true
  )

  const hint =
    requiresBuyerSelection && !showPrice
      ? gateOk && gate.requiresSelection
        ? pdpPriceHintForGate(gate)
        : "Выберите параметры, чтобы увидеть цену"
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
