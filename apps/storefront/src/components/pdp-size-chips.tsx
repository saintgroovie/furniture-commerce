"use client"

import Link from "next/link"
import {
  materialCodeForProduct,
  usePdpMaterialSelection,
} from "@/lib/cart/pdp-material-selection"
import type { MaterialTierOption } from "@/lib/material-tiers"
import { resolveMaterialTierPrice } from "@/lib/material-tiers"
import { formatRub } from "@/lib/format"
import { pdpCopy } from "@/lib/woodright-copy"

export type PdpSizeChip = {
  id: string
  label: string
  /** Full-solid (base) RUB price of the chip's product; null → no price shown. */
  basePrice: number | null
  isCurrent: boolean
}

type Props = {
  /** Handle/id of the product whose PDP renders the chips. */
  productKey: string
  /** Pre-sorted by display_group_sort on the server. */
  chips: PdpSizeChip[]
  /**
   * Material tiers of the current product. Sibling products in one display
   * group share the same normalized tier set, so the selected multiplier
   * applies to every chip price — matching what each sibling PDP would show.
   */
  materialTiers: MaterialTierOption[] | null
  /** request_quote products keep the «от … ₽» reference-price shape. */
  requestQuote: boolean
}

/**
 * Size selector chips whose prices follow the material execution selected in
 * the PDP dropdown — the big price block and the chips must never show
 * conflicting numbers for the same configuration.
 */
export function PdpSizeChips({ productKey, chips, materialTiers, requestQuote }: Props) {
  const materialSelection = usePdpMaterialSelection()

  let multiplier = 1
  if (materialTiers && materialTiers.length > 0) {
    const code = materialCodeForProduct(materialSelection, productKey)
    const tier = materialTiers.find((t) => t.code === code) ?? materialTiers[0]
    multiplier = tier.multiplier
  }

  const priceLabelFor = (basePrice: number | null): string | null => {
    if (basePrice == null) return null
    const amount = resolveMaterialTierPrice(basePrice, multiplier)
    return requestQuote ? `от ${formatRub(amount)}` : formatRub(amount)
  }

  const current = chips.find((c) => c.isCurrent)

  return (
    <div className="pdp-size-selector" role="group" aria-label={pdpCopy.sizeSelectorLabel}>
      <span className="pdp-option-heading">
        <span className="pdp-option-heading-label">{pdpCopy.sizeSelectorLabel}</span>
        <span className="pdp-option-heading-sep" aria-hidden="true">
          {" - "}
        </span>
        <span className="pdp-option-heading-value">{current?.label}</span>
      </span>
      <div className="pdp-size-chip-row">
        {chips.map((chip) => {
          const priceLabel = priceLabelFor(chip.basePrice)
          return chip.isCurrent ? (
            <span key={chip.id} className="pdp-size-chip is-active" aria-current="true">
              <span className="pdp-size-chip-label">{chip.label}</span>
              {priceLabel != null && (
                <span className="pdp-size-chip-price">{priceLabel}</span>
              )}
            </span>
          ) : (
            <Link key={chip.id} href={`/product/${chip.id}`} className="pdp-size-chip">
              <span className="pdp-size-chip-label">{chip.label}</span>
              {priceLabel != null && (
                <span className="pdp-size-chip-price">{priceLabel}</span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
