import type { PriceRow } from "./catalog-promo-price-list"
import { priceAmount } from "./catalog-promo-price-list"
import type { SellerProduct } from "./seller-product-types"

/**
 * Attach the canonical catalog promo row (read through the pricing module,
 * keyed by price_set_id) to each variant. The product graph does not always
 * expose price-list rows, so the detail route reads them explicitly.
 * Pure: returns a new product, never touches `rub_price`.
 */
export function attachPromoPrices(
  product: SellerProduct,
  rows: Map<string, PriceRow>,
  priceListId: string
): SellerProduct {
  return {
    ...product,
    variants: product.variants.map((variant) => {
      const row = variant.price_set_id ? rows.get(variant.price_set_id) : undefined
      const amount = priceAmount(row)
      if (amount == null) return { ...variant, promo_price: variant.promo_price ?? null }
      return { ...variant, promo_price: { amount, price_list_id: priceListId } }
    }),
  }
}
