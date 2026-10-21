import { inferDisplayGroupAxis, sizeAxisConstructionKey } from "./display-group"
import type { MaterialTierOption } from "./material-tiers"
import { buildOfferJsonLd, offerAvailabilityFromPurchase, readUniformRubAmounts, singleOfferPriceRub } from "./product-json-ld"
import { isRequestQuoteProduct } from "./request-quote"
import { readProductPurchase } from "./woodright-order/purchase-contract"

type Product = Record<string, unknown>
type JsonLd = Record<string, unknown>
const TOKEN = /^[a-z0-9][a-z0-9_-]{0,120}$/i
const HANDLE = /^[a-z0-9][a-z0-9-]{0,120}$/i

function metadata(product: Product): Product {
  return (product.metadata as Product | null) ?? {}
}

function singleVariant(product: Product): Product | null {
  const variants = product.variants
  if (!Array.isArray(variants) || variants.length !== 1) return null
  const variant = variants[0] as Product
  return typeof variant?.id === "string" && typeof variant.sku === "string" && variant.sku.trim()
    ? variant : null
}

function publicHandle(product: Product): string | null {
  return product.status === "published" && typeof product.handle === "string" && HANDLE.test(product.handle)
    ? product.handle : null
}

function isQuote(product: Product): boolean {
  const classification = product.product_classification as Product | undefined
  return isRequestQuoteProduct(product) || classification?.product_type === "BESPOKE"
}

/** Only a size explicitly printed in the title; never decode a SKU or use outer dimensions. */
export function explicitVariantSize(product: Product): string | null {
  const matches = String(product.title ?? "").match(/\(\d{2,3}\s*[×xх*]\s*\d{2,3}\)/gi)
  return matches?.length === 1 ? matches[0].slice(1, -1).replace(/\s/g, "").replace(/[xх*]/gi, "×") : null
}

/** A PDP buys its own size. The family never gets a fabricated common price. */
export function buildSizeVariantJsonLd(input: {
  product: Product
  siblings: Product[]
  jsonLd: JsonLd
  displayedPriceRub: number | null
  requestQuote: boolean
}): JsonLd | null {
  const { product, jsonLd, siblings } = input
  const meta = metadata(product)
  const group = meta.display_group
  if (typeof group !== "string" || !TOKEN.test(group) || !siblings.length || input.requestQuote || isQuote(product)) return null
  if (!singleVariant(product) || !publicHandle(product)) return null
  const rawTiers = meta.material_tiers
  if (rawTiers && (typeof rawTiers !== "object" || Object.keys(rawTiers).length !== 1 ||
      Number((rawTiers as Record<string, Product>).solid_full?.price_multiplier) !== 1)) return null
  const members = [product, ...siblings]
  if (inferDisplayGroupAxis(members) !== "size") return null
  const construction = sizeAxisConstructionKey(String(product.title ?? ""))
  const sizes = members.map(explicitVariantSize)
  if (sizes.some((size) => !size) || new Set(sizes).size !== members.length) return null
  if (members.some((member) => !publicHandle(member) || metadata(member).display_group !== group ||
      sizeAxisConstructionKey(String(member.title ?? "")) !== construction)) return null
  const price = singleOfferPriceRub({
    requestQuote: input.requestQuote, materialTierCount: 0, displayGroupCount: 0,
    variantAmounts: readUniformRubAmounts(product), displayedPriceRub: input.displayedPriceRub,
  })
  if (price == null) return null
  const urls = members.map((member) => new URL(`/product/${publicHandle(member)}`, String(jsonLd.url)).href)
  if (new Set(urls).size !== members.length || !urls.includes(String(jsonLd.url))) return null
  const productId = `${jsonLd.url}#product`
  // No group URL: sizes live on separate canonical pages. The stable @id is shared.
  const groupId = `${[...urls].sort()[0]}#group-${group}`
  return {
    ...jsonLd, "@id": productId, size: sizes[0],
    inProductGroupWithID: group,
    isVariantOf: {
      "@type": "ProductGroup", "@id": groupId, productGroupID: group,
      name: String(meta.display_group_title || product.title),
      brand: jsonLd.brand, variesBy: ["https://schema.org/size"],
      hasVariant: urls.map((url) => url === jsonLd.url
        ? { "@id": productId }
        : { "@type": "Product", url }),
    },
    offers: buildOfferJsonLd({
      url: String(jsonLd.url), priceRub: price,
      availability: offerAvailabilityFromPurchase(readProductPurchase(product)),
    }),
  }
}

/** Materials must reconcile to the same native variant and backend opening contract. */
export function verifiedMaterialOptions(
  product: Product, options: MaterialTierOption[] | null
): MaterialTierOption[] | null {
  if (!publicHandle(product) || !singleVariant(product) || isQuote(product) || metadata(product).display_group) return null
  if (!options || options.length < 2) return null
  const amounts = readUniformRubAmounts(product)
  if (!amounts || amounts.length !== 1) return null
  const meta = metadata(product)
  const raw = meta.material_tiers as Record<string, Product> | undefined
  if (!raw || Object.keys(raw).length !== options.length) return null
  if (new Set(options.map((option) => option.code)).size !== options.length ||
      new Set(options.map((option) => option.label.trim())).size !== options.length) return null
  for (const option of options) {
    if (!TOKEN.test(option.code) || !option.label.trim() || option.price == null || option.price <= 0 ||
        option.price !== Math.round(amounts[0] * option.multiplier)) return null
    if (raw[option.code]?.price_rub != null && Number(raw[option.code].price_rub) !== option.price) return null
  }
  const contract = meta.buyer_default_configuration as Product | undefined
  const variant = singleVariant(product)!
  if (!contract || contract.variant_id !== variant.id || contract.material_execution_code !== options[0].code ||
      contract.min_unit_price !== options[0].price || contract.color_multiplier !== 1 ||
      contract.material_price_multiplier !== options[0].multiplier) return null
  return options
}

/** Existing consumers use option zero for SSR, price, selection and cart metadata. */
export function materialOptionsForUrl(
  options: MaterialTierOption[], query: string | string[] | undefined
): MaterialTierOption[] {
  if (typeof query !== "string") return options
  const selected = options.find((option) => option.code === query)
  return selected ? [selected, ...options.filter((option) => option !== selected)] : options
}

/** Every material Offer has a URL that opens that exact tier, including SSR. */
export function buildMaterialVariantJsonLd(input: {
  product: Product
  options: MaterialTierOption[]
  jsonLd: JsonLd
  requestQuote: boolean
}): JsonLd | null {
  const { product, jsonLd } = input
  const options = verifiedMaterialOptions(product, input.options)
  if (!options || input.requestQuote || !Array.isArray(jsonLd.image) || !jsonLd.image.length) return null
  const variant = singleVariant(product)!
  const groupId = `${jsonLd.url}#materials`
  return {
    "@context": "https://schema.org", "@type": "ProductGroup", "@id": groupId,
    name: jsonLd.name, description: jsonLd.description, brand: jsonLd.brand,
    url: jsonLd.url, productGroupID: `${product.id}:materials`,
    variesBy: ["https://schema.org/material"],
    hasVariant: options.map((option) => {
      const url = new URL(String(jsonLd.url))
      url.searchParams.set("material", option.code)
      return {
        ...jsonLd, "@id": `${url.href}#product`, url: url.href,
        // Keep the real commercial SKU. The native variant + execution code
        // provides the distinct configuration identity without inventing a SKU.
        productID: `${variant.id}:${option.code}`,
        name: `${jsonLd.name} — ${option.label}`, material: option.label,
        inProductGroupWithID: `${product.id}:materials`, isVariantOf: { "@id": groupId },
        offers: buildOfferJsonLd({
          url: url.href, priceRub: option.price!,
          availability: offerAvailabilityFromPurchase(readProductPurchase(product)),
        }),
      }
    }),
  }
}
