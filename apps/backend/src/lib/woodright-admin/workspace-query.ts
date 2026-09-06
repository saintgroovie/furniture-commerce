import type { AttentionFilter, SellerProduct } from "./seller-product-types"

/** Static create route segment. Must not be treated as a product id. */
export const WOODRIGHT_CREATE_PRODUCT_SEGMENT = "new"

export function isWoodrightCreateProductSegment(id: string | undefined | null): boolean {
  return id === WOODRIGHT_CREATE_PRODUCT_SEGMENT
}

export function matchesAttentionFilter(
  product: SellerProduct,
  filter: AttentionFilter
): boolean {
  if (filter === "all") return true
  if (filter === "drafts") return product.readiness.codes.includes("draft")
  if (filter === "missing_media") return product.readiness.codes.includes("missing_media")
  if (filter === "missing_price") return product.readiness.codes.includes("missing_price")
  if (filter === "published_invisible") {
    return product.readiness.codes.includes("published_invisible")
  }
  return true
}

export function formatSellerVariantCount(count: number): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  let word = "вариантов"
  if (abs > 10 && abs < 20) word = "вариантов"
  else if (last === 1) word = "вариант"
  else if (last >= 2 && last <= 4) word = "варианта"
  return `${count} ${word}`
}

export function matchesSellerSearch(product: SellerProduct, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  if (product.title.toLowerCase().includes(needle)) return true
  if (product.handle.toLowerCase().includes(needle)) return true
  if (product.collection_label?.toLowerCase().includes(needle)) return true
  return product.skus.some((sku) => sku.toLowerCase().includes(needle))
}

export function findExactSkuMatch(products: SellerProduct[], query: string): SellerProduct | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null
  const matches = products.filter((product) =>
    product.skus.some((sku) => sku.toLowerCase() === needle)
  )
  return matches.length === 1 ? matches[0] : null
}
