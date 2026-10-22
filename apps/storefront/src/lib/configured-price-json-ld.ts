import scope from "./configured-price-json-ld-scope.json"
import type { CardExecutionSelectors } from "./card-color-media"
import type { PdpExecutionSelection } from "./cart/pdp-selection"
import type { PdpMaterialSelection } from "./cart/pdp-material-selection"
import type { MaterialTierOption } from "./material-tiers"
import { resolveConfiguredUnitPrice, resolveFinishColorMultiplier } from "./finish-color-premium"
import { readUniformRubAmounts } from "./product-json-ld"
import { defaultGreenwichPaintSelection } from "./greenwich-paint-media"

type JsonLd = Record<string, unknown>
export type ConfiguredPriceJsonLdContext = {
  productKey: string
  basePrice: number
  standardFinishKey: string
  finishKeys: string[]
  materialTiers: MaterialTierOption[]
}

/** Only the twenty audited identities; no new prices, SKUs or business rules. */
export function configuredPriceJsonLdContext(input: {
  product: JsonLd
  selectors: CardExecutionSelectors
  basePrice: number | null
  materialTiers: MaterialTierOption[] | null
}): ConfiguredPriceJsonLdContext | null {
  const { product, selectors, basePrice, materialTiers } = input
  const productKey = String(product.handle)
  const audited = (scope as Record<string, typeof scope["co-02-1"]>)[productKey]
  const variants = product.variants as JsonLd[] | undefined
  const meta = product.metadata as JsonLd | undefined
  if (!audited || product.id !== audited.id || product.status !== "published" ||
      variants?.length !== 1 || variants[0].id !== audited.variantId || variants[0].sku !== audited.sku ||
      basePrice == null || !Number.isFinite(basePrice) || basePrice <= 0 ||
      selectors.provencePaintWood || selectors.headboard?.length || selectors.upholstery?.length ||
      selectors.separateFabricRows?.length) return null
  const amounts = readUniformRubAmounts(product)
  if (amounts?.length !== 1 || amounts[0] !== basePrice) return null
  const raw = meta?.paint_finish_executions ?? meta?.finish_color_executions
  if (!Array.isArray(raw) || raw.length < 2 || !selectors.finish ||
      raw.some((entry) => !entry || typeof entry.key !== "string" || !entry.key.trim())) return null
  const finishKeys = raw.map((entry) => String(entry.key).trim())
  if (new Set(finishKeys).size !== finishKeys.length ||
      JSON.stringify(finishKeys) !== JSON.stringify(selectors.finish.map((entry) => entry.key))) return null
  // A different opening paint is a pricing decision (GR-02-2), not a schema guess.
  if (selectors.greenwichPaintMatrix &&
      defaultGreenwichPaintSelection(selectors.greenwichPaintMatrix).paintFinish !== finishKeys[0]) return null
  const tiers = materialTiers ?? []
  if (tiers.some((tier) => !Number.isFinite(tier.multiplier) || tier.multiplier <= 0 ||
      tier.price !== resolveConfiguredUnitPrice(basePrice, tier.multiplier))) return null
  return { productKey, basePrice, standardFinishKey: finishKeys[0], finishKeys, materialTiers: tiers }
}

/** The visible price and cart use the same material × finish rule and rounding. */
export function selectedConfiguredPriceJsonLd(input: {
  jsonLd: JsonLd
  context: ConfiguredPriceJsonLdContext
  selection: PdpExecutionSelection | null
  materialSelection: PdpMaterialSelection | null
}): JsonLd | null {
  const { jsonLd, context, selection, materialSelection } = input
  // Preserve complete SSR markup and ignore another PDP's singleton state.
  if (!selection || selection.gate.productKey !== context.productKey) return jsonLd
  const gate = selection.gate
  if (!gate.complete || !gate.combinationAvailable || gate.standardFinishKey !== context.standardFinishKey ||
      !gate.finishKey || !context.finishKeys.includes(gate.finishKey)) return null
  const materialCode = materialSelection?.productKey === context.productKey ? materialSelection.code : null
  const tier = materialCode
    ? context.materialTiers.find((option) => option.code === materialCode)
    : context.materialTiers[0]
  if (materialCode && !tier) return null
  const amount = resolveConfiguredUnitPrice(context.basePrice, tier?.multiplier ?? 1,
    resolveFinishColorMultiplier(gate.finishKey, context.standardFinishKey))
  if (!Number.isFinite(amount) || amount <= 0) return null

  let product = jsonLd
  if (jsonLd["@type"] === "ProductGroup") {
    // On a selected material, publish its actual Offer, never adjust the other
    // materials' URL-addressed opening Offers to a colour those URLs don't select.
    const children = jsonLd.hasVariant as JsonLd[] | undefined
    const matches = children?.filter((child) => {
      try { return new URL(String(child.url)).searchParams.get("material") === tier?.code }
      catch { return false }
    })
    if (matches?.length !== 1) return null
    const { hasVariant: _variants, url: _url, ...family } = jsonLd
    product = { ...matches[0], isVariantOf: family }
  }
  const offer = product.offers
  if (product["@type"] !== "Product" || !offer || typeof offer !== "object" || Array.isArray(offer) ||
      (offer as JsonLd)["@type"] !== "Offer" || (offer as JsonLd).priceCurrency !== "RUB") return null
  // Copy all content, images, availability, policies and identities unchanged.
  return { ...product, offers: { ...offer, price: amount } }
}
