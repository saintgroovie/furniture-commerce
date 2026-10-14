import { orderedSparseVariants, sparseVariantMap } from "./sparse-variant-map"

function variantRecords(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = product.variants
  if (!Array.isArray(variants)) return []
  return variants.filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === "object")
  )
}

/**
 * Opening SKU for one canonical product.
 * Order: backend buyer_default_configuration, then the sparse axis sort,
 * then the only variant. Array position is not an opening rule.
 */
export function openingVariant(
  product: Record<string, unknown>
): Record<string, unknown> | null {
  const variants = variantRecords(product)
  if (variants.length === 0) return null
  const meta = product.metadata
  const cfg =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as { buyer_default_configuration?: unknown }).buyer_default_configuration
      : null
  const configuredId =
    cfg && typeof cfg === "object" && !Array.isArray(cfg)
      ? (cfg as { variant_id?: unknown }).variant_id
      : null
  if (typeof configuredId === "string") {
    const match = variants.find((variant) => variant.id === configuredId)
    if (match) return match
  }
  const map = sparseVariantMap(product)
  if (map) {
    const id = orderedSparseVariants(map)[0]?.id
    const match = id ? variants.find((variant) => variant.id === id) : undefined
    if (match) return match
  }
  if (variants.length === 1) return variants[0] ?? null
  return null
}

/**
 * PDP selection. A valid `?variant=` wins. Otherwise the opening SKU.
 * Chip fallbacks stay outside this helper.
 */
export function selectedBuyerVariantId(
  product: Record<string, unknown>,
  requested: string | undefined
): string | null {
  const variants = variantRecords(product)
  if (requested && variants.some((variant) => variant.id === requested)) return requested
  const opening = openingVariant(product)
  return typeof opening?.id === "string" ? opening.id : null
}
