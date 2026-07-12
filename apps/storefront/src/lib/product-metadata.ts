import { isOliverKidsHandle } from "@/lib/oliver-kids-scope"

type Dimensions = {
  width_mm?: number
  depth_mm?: number
  height_mm?: number
}

type ProductLike = Record<string, unknown>

function meta(product: ProductLike): Record<string, unknown> {
  return (product.metadata as Record<string, unknown>) ?? {}
}

/** Buyer-facing collection titles (handles/slugs stay English). */
const COLLECTION_SLUG_LABELS: Record<string, string> = {
  country: "Кантри",
  "country-london-paris": "Кантри",
  greenwich: "Гринвич",
  oliver: "Оливер",
  "oliver-kids": "Оливер · детская",
  "willie-winkie": "Вилли Винки",
  monchelsea: "Мончелси",
  provence: "Прованс",
}

/** Map English (or already-RU) display titles back to the Russian buyer label. */
const COLLECTION_TITLE_ALIASES: Record<string, string> = {
  greenwich: "Гринвич",
  гринвич: "Гринвич",
  oliver: "Оливер",
  оливер: "Оливер",
  "oliver-kids": "Оливер · детская",
  "oliver-kids-line": "Оливер · детская",
  "оливер-детская": "Оливер · детская",
  "оливер-·-детская": "Оливер · детская",
  "willie-winkie": "Вилли Винки",
  "вилли-винки": "Вилли Винки",
  "willie-winkie-kids": "Вилли Винки",
  monchelsea: "Мончелси",
  мончелси: "Мончелси",
  provence: "Прованс",
  прованс: "Прованс",
  country: "Кантри",
  кантри: "Кантри",
}

/** Buyer-facing primary collection on catalog/PDP cards (Russian UI). */
const COUNTRY_CARD_LABEL = "Кантри"

function normalizeCollectionLabelKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[·•]/g, " ")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
}

function localizeKnownCollectionLabel(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return trimmed
  const key = normalizeCollectionLabelKey(trimmed)
  if (COLLECTION_SLUG_LABELS[key]) return COLLECTION_SLUG_LABELS[key]!
  if (COLLECTION_TITLE_ALIASES[key]) return COLLECTION_TITLE_ALIASES[key]!
  return trimmed
}

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
  if (h.startsWith("ol-")) {
    if (isOliverKidsHandle(h)) return COLLECTION_SLUG_LABELS["oliver-kids"]!
    return COLLECTION_SLUG_LABELS.oliver!
  }
  if (h.startsWith("pv-")) return COLLECTION_SLUG_LABELS.provence!
  if (h.startsWith("greenwich-") || h.startsWith("gr-")) return COLLECTION_SLUG_LABELS.greenwich!
  if (h.startsWith("mn-") || h.startsWith("monchelsea-")) return COLLECTION_SLUG_LABELS.monchelsea!
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
  if (typeof label === "string" && label.trim()) {
    return localizeKnownCollectionLabel(label)
  }

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

/** Buyer-facing H1 — fixes known workbook typos without mutating Medusa in SSR. */
export function getBuyerFacingProductTitle(product: ProductLike): string {
  const raw =
    getCanonicalName(product) ??
    (typeof product.title === "string" && product.title.trim()
      ? product.title.trim()
      : "Товар")
  return raw
    .replace(/филенгками/gi, "филенками")
    .replace(/\/\s*филен/gi, " и филен")
    .replace(/\.\s*$/g, "")
    .trim()
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
  // Compact card meta: no space around × (650×30×1000).
  return parts.join("×")
}

export function formatDimensionsLabeled(dim: Dimensions): string {
  const parts: string[] = []
  if (dim.width_mm) parts.push(`Ш. ${dim.width_mm}`)
  if (dim.depth_mm) parts.push(`Гл. ${dim.depth_mm}`)
  if (dim.height_mm) parts.push(`В. ${dim.height_mm}`)
  return parts.join(" × ") + " мм"
}

/** PDP hero crop focal point (`object-position`). Metadata overrides handle map. */
const PDP_HERO_OBJECT_POSITION_BY_HANDLE: Record<string, string> = {
  "greenwich-gr-09-1-mirror": "left center",
}

export function getPdpHeroObjectPosition(product: ProductLike): string | undefined {
  const fromMeta = meta(product).pdp_hero_object_position
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim()
  }
  const handle = product.handle
  if (typeof handle === "string") {
    return PDP_HERO_OBJECT_POSITION_BY_HANDLE[handle]
  }
  return undefined
}
