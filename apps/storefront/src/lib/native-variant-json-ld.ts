import { buyerVariantAxis, type BuyerVariantAxis } from "./buyer-variant-axis"
import { buildOfferJsonLd, buildProductJsonLd, offerAvailabilityFromPurchase } from "./product-json-ld"
import { resolvePdpMediaSrc } from "./product-images"
import { variantRubPrice } from "./variant-rub-price"
import { readProductPurchase } from "./woodright-order/purchase-contract"
import { isRequestQuoteProduct } from "./request-quote"
import { presentBuyerTitleParts } from "./product-title-presentation"
import { withBuyerTitleProperties } from "./product-title-json-ld"

type Row = Record<string, unknown>

/** Native one-axis choices rendered by PDP chips, including OS-created executions. */
export function buildNativeVariantJsonLd(input: {
  product: Row
  jsonLd: Row
  selectedVariantId: string | null
  displayedPriceRub: number | null
  commonImages: string[]
  axis?: BuyerVariantAxis | null
}): Row | null {
  const { product, jsonLd } = input
  const axis = input.axis ?? buyerVariantAxis(product)
  if (product.status !== "published" || typeof product.id !== "string" ||
      isRequestQuoteProduct(product) || (product.product_classification as Row | undefined)?.product_type === "BESPOKE" ||
      !axis || axis.choices.length < 2 || !input.selectedVariantId) return null
  const variants = (product.variants as Row[] | undefined)?.filter((v) => !v.deleted_at) ?? []
  if (variants.length !== axis.choices.length || new Set(axis.choices.map((v) => v.sku)).size !== variants.length) return null
  const selected = variants.find((v) => v.id === input.selectedVariantId)
  if (!selected || input.displayedPriceRub == null || variantRubPrice(selected) !== input.displayedPriceRub) return null
  const groupId = `${jsonLd.url}#native-variants`
  const property = ({ размер: "size", "размер спального места": "size", цвет: "color", материал: "material", узор: "pattern" } as Record<string, string>)[axis.label.toLowerCase()]
  const members: Row[] = []
  for (const choice of axis.choices) {
    const variant = variants.find((v) => v.id === choice.id)
    const price = variantRubPrice(variant)
    if (!variant || price == null) return null
    const url = new URL(String(jsonLd.url))
    url.searchParams.set("variant", choice.id)
    const gallery = (variant.metadata as Row | undefined)?.gallery_urls
    const images = Array.isArray(gallery) && gallery.length && gallery.every((u) => typeof u === "string" && u.trim())
      ? gallery.map((u) => resolvePdpMediaSrc(u as string)) : input.commonImages
    const presented = presentBuyerTitleParts({
      title: String(product.title ?? ""),
      handle: typeof product.handle === "string" ? product.handle : null,
      metadata: product.metadata as Row | undefined,
      options: Array.isArray(product.options) ? product.options : undefined,
      selection: { title: typeof variant.title === "string" ? variant.title : null, metadata: variant.metadata as Row | undefined,
        options: Array.isArray(variant.options) ? variant.options : undefined },
    })
    const item = withBuyerTitleProperties(buildProductJsonLd({
      name: String(jsonLd.name),
      description: typeof jsonLd.description === "string" ? jsonLd.description : null,
      url: url.href, sku: choice.sku, images,
      material: typeof jsonLd.material === "string" ? jsonLd.material : null,
    }), presented.attributes)
    if (!Array.isArray(item.image) || !item.image.length) return null
    members.push({
      ...item, "@id": `${url.href}#product`, productID: choice.id,
      ...(property ? { [property]: choice.label } : {}),
      additionalProperty: [...new Map([
        ...(Array.isArray(item.additionalProperty) ? item.additionalProperty : []),
        { "@type": "PropertyValue", name: axis.label, value: choice.label },
      ].map((value) => [JSON.stringify(value), value])).values()],
      inProductGroupWithID: String(product.id), isVariantOf: { "@id": groupId },
      offers: buildOfferJsonLd({ url: url.href, priceRub: price,
        availability: offerAvailabilityFromPurchase(readProductPurchase(product)) }),
    })
  }
  return {
    "@context": "https://schema.org", "@type": "ProductGroup", "@id": groupId,
    name: jsonLd.name, description: jsonLd.description, brand: jsonLd.brand,
    url: jsonLd.url, productGroupID: String(product.id),
    // Google supports only specific schema.org variation properties. A custom
    // execution remains its truthful additionalProperty, never an invented size/color.
    ...(property ? { variesBy: [`https://schema.org/${property}`] } : {}), hasVariant: members,
  }
}
