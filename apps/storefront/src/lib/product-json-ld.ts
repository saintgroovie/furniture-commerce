/**
 * Truthful Product / BreadcrumbList JSON-LD.
 * No ratings, reviews, or invented stock / shipping promises.
 * Offer is emitted only for one unambiguous purchasable RUB price.
 */

import { isDirectCartPurchase, type StorefrontPurchaseDto } from "./woodright-order/purchase-contract"
import { sellerOrganizationId } from "./organization-json-ld"
export { jsonLdHtml } from "./json-ld"
import { merchantPolicyIds } from "./merchant-policy-json-ld"
import { variantRubPrice } from "./variant-rub-price"

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i

/** Use the same explicit sales contract the buyer sees; never infer stock. */
export function offerAvailabilityFromPurchase(purchase: StorefrontPurchaseDto | null) {
  if (!purchase) return null
  if (purchase.sales_mode === "unavailable") return "https://schema.org/OutOfStock"
  if (!isDirectCartPurchase(purchase)) return null
  if (purchase.sales_mode === "in_stock") {
    return "https://schema.org/InStock"
  }
  if (purchase.sales_mode === "made_to_order" || purchase.sales_mode === "configurable_to_order") {
    // Existing products accepted for a future supply after manufacture.
    // Google does not yet support Schema.org's newer MadeToOrder value.
    return "https://schema.org/BackOrder"
  }
  return null
}

/** Shared by scalar, size and material offers so policy fields cannot drift. */
export function buildOfferJsonLd(input: {
  url: string
  priceRub: number
  availability?: ReturnType<typeof offerAvailabilityFromPurchase>
}): Record<string, unknown> {
  const ids = merchantPolicyIds(input.url)
  return {
    "@type": "Offer",
    seller: { "@id": sellerOrganizationId(input.url) },
    priceCurrency: "RUB",
    price: input.priceRub,
    url: input.url,
    ...(input.availability ? { availability: input.availability } : {}),
    hasMerchantReturnPolicy: { "@id": ids.returns },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      hasShippingService: { "@id": ids.shipping },
    },
  }
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
    const n = variantRubPrice(variant as Record<string, unknown>)
    if (n == null) return null
    out.push(n)
  }
  return out
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
  dimensions?: { axis: "height" | "width" | "depth"; mm?: number; values_mm?: number[] }[]
  sku?: string | null
  /** Explicit catalog material; never inferred from a collection or description. */
  material?: string | null
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
  const material = input.material?.trim()
  if (material) ld.material = material
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
    } else if (cell.values_mm && cell.values_mm.length >= 2 &&
        cell.values_mm.every((n) => Number.isFinite(n) && n > 0) &&
        new Set(cell.values_mm).size === cell.values_mm.length) {
      const names = { height: "Высота", width: "Ширина", depth: "Глубина" }
      const list = (ld.additionalProperty ?? []) as Record<string, unknown>[]
      ld.additionalProperty = [...list, { "@type": "PropertyValue", name: names[cell.axis],
        value: cell.values_mm.join(" / "), unitText: "мм" }]
    }
  }
  const sku = input.sku?.trim()
  if (sku) ld.sku = sku
  if (
    input.offerPriceRub != null &&
    Number.isFinite(input.offerPriceRub) &&
    input.offerPriceRub > 0
  ) {
    ld.offers = buildOfferJsonLd({
      url: input.url,
      priceRub: input.offerPriceRub,
      availability: input.offerAvailability,
    })
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
