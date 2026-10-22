import type { MotifProductCard, MotifOption } from "./api/motif-themes"
import { isBuyerPublicProductStatus } from "./buyer-publication"
import { resolveCatalogCardPrice } from "./catalog-card-price"
import { cardThumbnailSrcFromProduct } from "./card-color-media"

/** Motif routes own membership; the fresh browse projection owns sellable cards. */
export function motifCatalogIndex(products: Array<Record<string, unknown>>) {
  const index = new Map<string, Record<string, unknown>>()
  const seen = new Set<string>()
  for (const product of products) {
    if (!isBuyerPublicProductStatus(product.status)) continue
    if (typeof product.handle !== "string" || !product.handle) continue
    // An ambiguous handle must never borrow another product's price or photo.
    if (seen.has(product.handle)) index.delete(product.handle)
    else index.set(product.handle, product)
    seen.add(product.handle)
  }
  return index
}

export function refreshMotifCards(
  cards: MotifProductCard[],
  index: ReturnType<typeof motifCatalogIndex>
): MotifProductCard[] {
  return cards.flatMap((card) => {
    const product = index.get(card.handle)
    if (!product) return []
    const price = resolveCatalogCardPrice(product)
    return [{
      ...card,
      thumbnail: cardThumbnailSrcFromProduct(product) || null,
      price_amount: price.amount,
      price_prefix: price.prefix,
      price_label: price.requestQuoteLabel,
    }]
  })
}

export function refreshMotifOptions(
  options: MotifOption[],
  index: ReturnType<typeof motifCatalogIndex>
): MotifOption[] {
  return options.flatMap((option) => {
    const product = index.get(option.product_handle)
    if (!product) return []
    return [{
      ...option,
      motif_cover: cardThumbnailSrcFromProduct(product) || null,
      price_amount: resolveCatalogCardPrice(product).amount,
    }]
  })
}
