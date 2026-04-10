/**
 * Какие значения `product.metadata.collection` показываются в публичном каталоге.
 * Товары без `metadata.collection` пропускаются (демо seed и legacy).
 * Явно паузируемые slug скрываются.
 */

const PAUSED_COLLECTION_KEYS = new Set([
  "princess-rose",
  "country-london-paris",
  "oxford",
  "provence",
])

const ACTIVE_COLLECTION_KEYS = new Set([
  "greenwich",
  "oliver",
  "oliver-adult",
  "oliver-kids",
  "willie-winkie",
  "monchelsea",
])

export function isProductInActiveCatalogScope(product: Record<string, unknown>): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  const key = meta?.collection
  if (key == null || key === "") return true
  if (typeof key !== "string") return true
  if (PAUSED_COLLECTION_KEYS.has(key)) return false
  if (ACTIVE_COLLECTION_KEYS.has(key)) return true
  return false
}
