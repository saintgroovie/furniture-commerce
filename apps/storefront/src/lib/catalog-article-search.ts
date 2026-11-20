/** Article lookup uses native variant SKUs, never editorial names or URL handles. */
export function normalizeCatalogArticle(value: string): string {
  return value.trim().replace(/[a-z]/g, letter => letter.toUpperCase())
    .replace(/[\u2010-\u2014\u2212\uFF0D]/g, "-")
}

export function matchesCatalogArticle(product: Record<string, unknown>, query: string): boolean {
  const article = normalizeCatalogArticle(query)
  if (!article) return true
  if (!Array.isArray(product.variants)) return false
  return product.variants.some(variant => {
    if (!variant || typeof variant !== "object") return false
    const sku = (variant as Record<string, unknown>).sku
    return typeof sku === "string" && normalizeCatalogArticle(sku) === article
  })
}
