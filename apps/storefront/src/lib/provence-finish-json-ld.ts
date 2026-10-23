import { verifiedProvencePrices } from "./verified-september-catalog"
import { buildOfferJsonLd, offerAvailabilityFromPurchase, readUniformRubAmounts } from "./product-json-ld"
import { readProductPurchase } from "./woodright-order/purchase-contract"

type Product = Record<string, unknown>
type Media = { key: string; label: string; mainSrc: string; extraSrcs: string[] }

/** Published, selectable finishes only; exact September prices and existing media. */
export function verifiedProvenceFinishPrices(product: Product) {
  const variants = product.variants as Product[] | undefined
  const meta = product.metadata as Product | undefined
  const purchase = readProductPurchase(product)
  const base = readUniformRubAmounts(product)
  if (product.status !== "published" || variants?.length !== 1 ||
      meta?.workbook_row_key !== `provence:${String(variants[0].sku)}` ||
      String(product.handle).toUpperCase() !== variants[0].sku ||
      meta.finish_metadata_source !== "provence_paint_wood_split" ||
      !purchase?.can_purchase || purchase.purchase_flow !== "cart" ||
      !base || base.length !== 1) return null
  return verifiedProvencePrices(String(product.handle), base[0])
}

export function buildProvenceFinishJsonLd(product: Product, scalar: Product, media: Media[]): Product | null {
  const prices = verifiedProvenceFinishPrices(product)
  if (!prices || media.length !== 2 || !media.every((item) => item.mainSrc && item.label) ||
      new Set(media.map((item) => item.key)).size !== 2 ||
      !media.some((item) => item.key === "cream") || !media.some((item) => item.key === "wood")) return null
  const groupId = `${scalar.url}#finishes`
  const variant = (product.variants as Product[])[0]
  return {
    "@context": "https://schema.org", "@type": "ProductGroup", "@id": groupId,
    name: scalar.name, description: scalar.description, brand: scalar.brand, url: scalar.url,
    productGroupID: `${product.id}:finishes`, variesBy: ["https://schema.org/color"],
    hasVariant: media.map((item) => {
      const url = new URL(String(scalar.url))
      url.searchParams.set("finish", item.key)
      return {
        ...scalar, "@id": `${url.href}#product`, url: url.href,
        name: scalar.name, sku: variant.sku,
        productID: `${variant.id}:finish:${item.key}`, color: item.label,
        image: [...new Set([item.mainSrc, ...item.extraSrcs])].map((src) => new URL(src, url).href),
        inProductGroupWithID: `${product.id}:finishes`, isVariantOf: { "@id": groupId },
        offers: buildOfferJsonLd({ url: url.href, priceRub: item.key === "wood" ? prices.wood : prices.cream,
          availability: offerAvailabilityFromPurchase(readProductPurchase(product)) }),
      }
    }),
  }
}
