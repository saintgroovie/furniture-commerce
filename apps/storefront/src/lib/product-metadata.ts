type Dimensions = {
  width_mm?: number
  depth_mm?: number
  height_mm?: number
}

type ProductLike = Record<string, unknown>

function meta(product: ProductLike): Record<string, unknown> {
  return (product.metadata as Record<string, unknown>) ?? {}
}

const COLLECTION_SLUG_LABELS: Record<string, string> = {
  country: "Кантри",
  "country-london-paris": "Кантри",
  greenwich: "Greenwich",
  oliver: "Oliver",
  provence: "Provence",
}

/** Buyer-facing primary collection on catalog/PDP cards (Russian UI). */
const COUNTRY_CARD_LABEL = "Кантри"

function isCountryProduct(product: ProductLike, m: Record<string, unknown>): boolean {
  const handle = product.handle
  if (typeof handle === "string" && handle.toLowerCase().startsWith("co-")) {
    return true
  }
  const collection = m.collection
  if (typeof collection === "string" && collection.toLowerCase().startsWith("country")) {
    return true
  }
  const workbook = m.workbook_row_key
  if (typeof workbook === "string") {
    const prefix = workbook.split(":")[0]?.toLowerCase() ?? ""
    if (prefix.startsWith("country")) return true
  }
  return false
}

function normalizeCountryCollectionLabel(label: string): string {
  const lower = label.trim().toLowerCase()
  if (
    lower === "country" ||
    lower === "country london-paris" ||
    lower === "country london paris" ||
    lower.startsWith("country ")
  ) {
    return COUNTRY_CARD_LABEL
  }
  return label.trim()
}

function humanizeCollectionSlug(slug: string): string {
  const key = slug.trim().toLowerCase()
  if (COLLECTION_SLUG_LABELS[key]) return COLLECTION_SLUG_LABELS[key]!
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function collectionFromHandle(handle: string): string | null {
  const h = handle.toLowerCase()
  if (h.startsWith("co-")) return COUNTRY_CARD_LABEL
  if (h.startsWith("ol-")) return "Oliver"
  if (h.startsWith("pv-")) return "Provence"
  if (h.startsWith("greenwich-") || h.startsWith("gr-")) return "Greenwich"
  return null
}

export function getCollectionLabel(product: ProductLike): string | null {
  const m = meta(product)
  if (isCountryProduct(product, m)) {
    const label = m.collection_label
    if (typeof label === "string" && label.trim()) {
      return normalizeCountryCollectionLabel(label)
    }
    return COUNTRY_CARD_LABEL
  }

  const label = m.collection_label
  if (typeof label === "string" && label.trim()) return label.trim()

  const collection = m.collection
  if (typeof collection === "string" && collection.trim()) {
    return humanizeCollectionSlug(collection)
  }

  const workbook = m.workbook_row_key
  if (typeof workbook === "string" && workbook.includes(":")) {
    return humanizeCollectionSlug(workbook.split(":")[0]!)
  }

  const handle = product.handle
  if (typeof handle === "string" && handle.trim()) {
    return collectionFromHandle(handle.trim())
  }

  return null
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
  const m = meta(product)
  const dim = (m.dimensions ?? m.dimensions_normalized) as
    | Dimensions
    | undefined
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
