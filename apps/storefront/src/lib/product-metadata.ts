import {
  layoutBuyerFacingTitle,
  type BuyerFacingTitleLayout,
} from "@/lib/en-name-ru"
import { isOliverKidsHandle } from "@/lib/oliver-kids-scope"

type Dimensions = {
  width_mm?: number
  depth_mm?: number
  height_mm?: number
}

/** Buyer-facing axis order. Storage schema stays width_mm / height_mm / depth_mm. */
export type BuyerFacingDimensionAxis = "height" | "width" | "depth"

export const BUYER_FACING_DIMENSION_ORDER: readonly BuyerFacingDimensionAxis[] = [
  "height",
  "width",
  "depth",
] as const

const AXIS_TO_MM_KEY: Record<BuyerFacingDimensionAxis, keyof Dimensions> = {
  height: "height_mm",
  width: "width_mm",
  depth: "depth_mm",
}

/** Present dimensions in the fixed buyer order: height → width → depth. */
export function orderedBuyerFacingDimensions(
  dim: Dimensions
): Array<{ axis: BuyerFacingDimensionAxis; mm: number }> {
  const out: Array<{ axis: BuyerFacingDimensionAxis; mm: number }> = []
  for (const axis of BUYER_FACING_DIMENSION_ORDER) {
    const mm = dim[AXIS_TO_MM_KEY[axis]]
    if (typeof mm === "number" && Number.isFinite(mm) && mm > 0) {
      out.push({ axis, mm })
    }
  }
  return out
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

/** Buyer-facing H1 layout: type line + transcribed model (when present). */
export function getBuyerFacingProductTitleLayout(
  product: ProductLike
): BuyerFacingTitleLayout {
  const raw =
    getCanonicalName(product) ??
    (typeof product.title === "string" && product.title.trim()
      ? product.title.trim()
      : "Товар")
  return layoutBuyerFacingTitle(raw)
}

/** Flat buyer-facing title (SEO / single-line). EN model names → Cyrillic. */
export function getBuyerFacingProductTitle(product: ProductLike): string {
  return getBuyerFacingProductTitleLayout(product).text
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
  // Card preview meta: whole centimeters (1244 mm -> 124), no unit label.
  // Narrow no-break spaces around × - a touch of air, still one unbreakable
  // run. Order matches PDP: height → width → depth.
  const cm = (mm: number) => String(Math.round(mm / 10))
  const parts = orderedBuyerFacingDimensions(dim).map(({ mm }) => cm(mm))
  return parts.join("\u202F×\u202F")
}

const LABELED_AXIS_ABBR: Record<BuyerFacingDimensionAxis, string> = {
  height: "В.",
  width: "Ш.",
  depth: "Гл.",
}

export function formatDimensionsLabeled(dim: Dimensions): string {
  // Technical / mm form. Same axis order as cm hero and card compact.
  const parts = orderedBuyerFacingDimensions(dim).map(
    ({ axis, mm }) => `${LABELED_AXIS_ABBR[axis]} ${mm}`
  )
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
