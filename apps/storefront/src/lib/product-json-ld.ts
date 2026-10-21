/**
 * Truthful Product / BreadcrumbList JSON-LD.
 * No ratings, reviews, or invented stock / shipping promises.
 * Offer is emitted only for one unambiguous purchasable RUB price.
 */

import type { StorefrontPurchaseDto } from "./woodright-order/purchase-contract"
import { merchantPolicyIds } from "./merchant-policy-json-ld"

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i

/** Use the same explicit sales contract the buyer sees; never infer stock. */
export function offerAvailabilityFromPurchase(purchase: StorefrontPurchaseDto | null) {
  if (!purchase) return null
  if (purchase.sales_mode === "unavailable") return "https://schema.org/OutOfStock"
  if (purchase.purchase_flow !== "cart") return null
  if (purchase.sales_mode === "in_stock" && purchase.can_purchase === true) {
    return "https://schema.org/InStock"
  }
  if (purchase.sales_mode === "made_to_order" || purchase.sales_mode === "configurable_to_order") {
    // Existing products accepted for a future supply after manufacture.
    // Google does not yet support Schema.org's newer MadeToOrder value.
    return "https://schema.org/BackOrder"
  }
  return null
}

export function productCanonicalPath(
  product: { handle?: unknown },
  requestedKey: string
): string {
  const handle = typeof product.handle === "string" ? product.handle.trim() : ""
  if (HANDLE_RE.test(handle)) return `/product/${handle}`
  const key = requestedKey.trim()
  return `/product/${key}`
}

function rubAmount(
  amount: unknown,
  currency: unknown
): number | null {
  if (String(currency ?? "").trim().toLowerCase() !== "rub") return null
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Every variant must have one positive RUB amount.
 * A missing price, a non-RUB currency, or an empty variant list fails closed.
 */
export function readUniformRubAmounts(
  product: Record<string, unknown>
): number[] | null {
  const variants = product.variants
  if (!Array.isArray(variants) || variants.length === 0) return null
  const out: number[] = []
  for (const variant of variants) {
    if (!variant || typeof variant !== "object") return null
    const rec = variant as Record<string, unknown>
    const calculated = rec.calculated_price as Record<string, unknown> | undefined
    if (calculated && calculated.calculated_amount != null) {
      const n = rubAmount(calculated.calculated_amount, calculated.currency_code)
      if (n == null) return null
      out.push(n)
      continue
    }
    const prices =
      (rec.prices as Array<Record<string, unknown>> | undefined) ??
      (rec.price_set as { prices?: Array<Record<string, unknown>> } | undefined)
        ?.prices
    const first = prices?.[0]
    if (!first) return null
    const n = rubAmount(first.amount, first.currency_code)
    if (n == null) return null
    out.push(n)
  }
  return out
}

/** JSON-LD safe to embed in a script tag (`<` cannot close the tag). */
export function jsonLdHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

/**
 * One Offer price, or null when the buyer-facing price is a range,
 * a quote, a material tier, or a display-group family.
 */
export function singleOfferPriceRub(input: {
  productType?: string | null
  requestQuote: boolean
  materialTierCount: number
  displayGroupCount: number
  variantAmounts: number[] | null
  /** Price the PDP actually opens with. Must match the variant amount. */
  displayedPriceRub: number | null
}): number | null {
  if (input.requestQuote) return null
  if (input.productType === "BESPOKE") return null
  if (input.materialTierCount > 0) return null
  if (input.displayGroupCount > 0) return null
  if (!input.variantAmounts || input.variantAmounts.length === 0) return null
  const first = input.variantAmounts[0]
  if (!input.variantAmounts.every((n) => n === first)) return null
  if (input.displayedPriceRub == null || input.displayedPriceRub !== first) return null
  return first
}

export type ProductJsonLdInput = {
  name: string
  description?: string | null
  url: string
  image?: string | null
  images?: string[]
  dimensions?: { axis: "height" | "width" | "depth"; mm?: number }[]
  sku?: string | null
  offerPriceRub?: number | null
  offerAvailability?: ReturnType<typeof offerAvailabilityFromPurchase>
}

export function buildProductJsonLd(
  input: ProductJsonLdInput
): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name.trim() || "Товар",
    url: input.url,
    brand: { "@type": "Brand", name: "Woodright" },
  }
  const description = input.description?.trim()
  if (description) ld.description = description
  const images = Array.from(new Set((input.images ?? [input.image ?? ""])
    .map((src) => {
      if (!src.trim()) return null
      try {
        const url = new URL(src.trim(), input.url)
        return /^https?:$/.test(url.protocol) ? url.href : null
      } catch {
        return null
      }
    }).filter((src): src is string => src != null)))
  if (images.length) ld.image = images
  // Only scalar dimensions actually shown on the PDP; do not turn a list of
  // folded/extended positions or alternative sizes into one invented value.
  for (const cell of input.dimensions ?? []) {
    if (cell.mm != null && Number.isFinite(cell.mm) && cell.mm > 0) {
      ld[cell.axis] = { "@type": "QuantitativeValue", value: cell.mm, unitCode: "MMT" }
    }
  }
  const sku = input.sku?.trim()
  if (sku) ld.sku = sku
  if (
    input.offerPriceRub != null &&
    Number.isFinite(input.offerPriceRub) &&
    input.offerPriceRub > 0
  ) {
    ld.offers = {
      "@type": "Offer",
      priceCurrency: "RUB",
      price: input.offerPriceRub,
      url: input.url,
      ...(input.offerAvailability ? { availability: input.offerAvailability } : {}),
      hasMerchantReturnPolicy: { "@id": merchantPolicyIds(input.url).returns },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        hasShippingService: { "@id": merchantPolicyIds(input.url).shipping },
      },
    }
  }
  return ld
}

export type BreadcrumbCrumb = { name: string; path?: string }

export function buildBreadcrumbJsonLd(
  origin: string,
  crumbs: BreadcrumbCrumb[]
): Record<string, unknown> {
  const base = origin.replace(/\/$/, "")
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => {
      const item: Record<string, unknown> = {
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
      }
      if (crumb.path) {
        const path = crumb.path.startsWith("/") ? crumb.path : `/${crumb.path}`
        item.item = `${base}${path}`
      }
      return item
    }),
  }
}
