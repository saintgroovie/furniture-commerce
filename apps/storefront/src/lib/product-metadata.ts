type Dimensions = {
  width_mm?: number
  depth_mm?: number
  height_mm?: number
}

type ProductLike = Record<string, unknown>

function meta(product: ProductLike): Record<string, unknown> {
  return (product.metadata as Record<string, unknown>) ?? {}
}

export function getCollectionLabel(product: ProductLike): string | null {
  const label = meta(product).collection_label
  return typeof label === "string" ? label : null
}

/** Workbook / canonical layer; optional subtitle on PDP when distinct from title. */
export function getCanonicalName(product: ProductLike): string | null {
  const name = meta(product).canonical_name
  return typeof name === "string" && name.trim() ? name.trim() : null
}

export function getSubcollectionLabel(product: ProductLike): string | null {
  const label = meta(product).subcollection_label
  return typeof label === "string" && label.trim() ? label.trim() : null
}

export function getArticle(product: ProductLike): string | null {
  const variants = product.variants as Array<Record<string, unknown>> | undefined
  const sku = variants?.[0]?.sku
  return typeof sku === "string" && sku ? sku : null
}

export function getDimensions(product: ProductLike): Dimensions | null {
  const dim = meta(product).dimensions as Dimensions | undefined
  if (!dim || (!dim.width_mm && !dim.depth_mm && !dim.height_mm)) return null
  return dim
}

export function formatDimensionsCompact(dim: Dimensions): string {
  const parts: string[] = []
  if (dim.width_mm) parts.push(String(dim.width_mm))
  if (dim.depth_mm) parts.push(String(dim.depth_mm))
  if (dim.height_mm) parts.push(String(dim.height_mm))
  return parts.join(" × ")
}

export function formatDimensionsLabeled(dim: Dimensions): string {
  const parts: string[] = []
  if (dim.width_mm) parts.push(`Ш. ${dim.width_mm}`)
  if (dim.depth_mm) parts.push(`Гл. ${dim.depth_mm}`)
  if (dim.height_mm) parts.push(`В. ${dim.height_mm}`)
  return parts.join(" × ") + " мм"
}
