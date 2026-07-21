import type { DisplayGroup } from "@/lib/display-group"
import { getPrice } from "@/lib/format"
import { buildMaterialTierOptions } from "@/lib/material-tiers"
import {
  formatRequestQuotePriceLabel,
  isRequestQuoteProduct,
} from "@/lib/request-quote"

function isPositivePrice(amount: number | null | undefined): amount is number {
  return amount != null && Number.isFinite(amount) && amount > 0
}

function readBackendDefaultMinPrice(
  product: Record<string, unknown>
): number | null {
  const meta = product.metadata as Record<string, unknown> | undefined
  const cfg = meta?.buyer_default_configuration
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return null
  const min = (cfg as { min_unit_price?: unknown }).min_unit_price
  return isPositivePrice(typeof min === "number" ? min : null) ? min : null
}

function minMaterialTierPrice(product: Record<string, unknown>): number | null {
  const tiers = buildMaterialTierOptions(product)
  if (!tiers) return null
  const prices = tiers.map((t) => t.price).filter(isPositivePrice)
  if (prices.length === 0) return null
  return Math.min(...prices)
}

function getProductType(product: Record<string, unknown>): string | undefined {
  return (
    (product.product_classification as { product_type?: string } | undefined)
      ?.product_type ??
    (product.custom_product_type as { product_type?: string } | undefined)
      ?.product_type
  )
}

export function resolveCatalogCardPrice(
  product: Record<string, unknown>,
  displayGroup?: DisplayGroup
): {
  amount: number | null
  prefix: "от " | ""
  requestQuoteLabel: string | null
} {
  if (isRequestQuoteProduct(product)) {
    return {
      amount: null,
      prefix: "",
      requestQuoteLabel: formatRequestQuotePriceLabel(product),
    }
  }

  /* Prefer backend-projected default configuration (browse DTO contract). */
  const backendMin = readBackendDefaultMinPrice(product)
  if (backendMin != null) {
    return { amount: backendMin, prefix: "от ", requestQuoteLabel: null }
  }

  const tierMin = minMaterialTierPrice(product)
  if (tierMin != null) {
    return { amount: tierMin, prefix: "от ", requestQuoteLabel: null }
  }

  if (displayGroup?.minPrice != null && isPositivePrice(displayGroup.minPrice)) {
    return { amount: displayGroup.minPrice, prefix: "от ", requestQuoteLabel: null }
  }

  const base = getPrice(product)
  if (!isPositivePrice(base)) {
    return { amount: null, prefix: "", requestQuoteLabel: null }
  }

  const productType = getProductType(product)
  if (productType === "CONFIGURABLE") {
    // Buyer-facing "from" for configurable even when tiers are not projected yet.
    return { amount: base, prefix: "от ", requestQuoteLabel: null }
  }

  return { amount: base, prefix: "", requestQuoteLabel: null }
}
