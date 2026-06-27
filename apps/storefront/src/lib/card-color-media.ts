import {
  collectExtraProductImageUrls,
  collectProductImageUrls,
  normalizeImageEntryUrl,
  resolveStorefrontProductImageSrc,
} from "./product-images"
import {
  isOliverFalseFinishColorSplit,
  repairOliverFalseFinishColorExecutions,
  detectOliverGalleryColorHeroPair,
  shouldSuppressOliverFinishWhenFabricCanonical,
} from "./oliver-finish-execution-guard"
import { hasProvencePaintWoodDualFinishEvidence } from "./provence-finish-execution-guard"
import {
  greenwichBedMatrixFromProduct,
  isGreenwichBedProduct,
  resolveGreenwichBedMedia,
  defaultGreenwichBedSelection,
  type GreenwichBedMatrixEntry,
} from "./greenwich-bed-media"
import {
  availableFrameKeysForPaint,
  availablePaintKeys,
  buildGreenwichPaintFinishVariants,
  buildGreenwichPaintWoodVariants,
  greenwichPaintMatrixFromProduct,
  isGreenwichPaintProduct,
} from "./greenwich-paint-media"
import { isMilkLikeFinishKey } from "../../../backend/src/lib/country-finish-labels"

export type CardColorVariant = {
  key: string
  label: string
  mainSrc: string
  extraSrcs: string[]
  /** CSS chip token for rounded-square swatch fill fallback */
  swatchToken?: string | null
  /** Canvas sample region when mainSrc is set (bed wood vs upholstery). */
  swatchSampleRegion?: "default" | "upholstery" | "frame_wood"
  /** Authoritative swatch fill from product metadata (overrides canvas pipette). */
  swatchHex?: string | null
}

export type CardModelVariant = {
  key: string
  label: string
  mainSrc: string
  extraSrcs: string[]
  modelToken: string
}

const NEUTRAL_KEY = "__neutral__"

/** Headboard / shape tokens — related model selectors, not color swatches. */
export const HEADBOARD_MODEL_TOKENS = new Set(["frame", "cloud", "plane"])

/** Material tokens treated as upholstery/fabric dimension. */
const UPHOLSTERY_MATERIAL_TOKENS = new Set([
  "velvet",
  "linen",
  "fabric",
  "upholstery",
])

/** Material tokens treated as wood/frame dimension. */
const WOOD_MATERIAL_TOKENS = new Set(["oak", "walnut", "wenge"])

export type CardExecutionConfidence =
  | "canonical"
  | "heuristic"
  | "metadata_blocked"

/** Card execution controls — model/headboard, upholstery, wood, or generic finish. */
export type CardExecutionSelectors = {
  headboard?: CardModelVariant[]
  upholstery?: CardColorVariant[]
  wood?: CardColorVariant[]
  finish?: CardColorVariant[]
  finishLabel?: "Цвет" | "Отделка" | "Материал" | "Конструкция"
  confidence: CardExecutionConfidence
  /** Greenwich bed: headboard × wood × fabric matrix (scoped galleries). */
  greenwichBedMatrix?: GreenwichBedMatrixEntry[]
  /** Greenwich paint: wood × paint color matrix. */
  greenwichPaintMatrix?: import("./greenwich-paint-media").GreenwichPaintMatrixEntry[]
  /** Provence pv-* paint (cream) × lacquered wood split — separate Цвет/Дерево rows. */
  provencePaintWood?: boolean
}

export type CardExecutionControls = CardExecutionSelectors

/** True when PDP/catalog should render execution swatch rows. */
export function hasPdpExecutionControls(sel: CardExecutionSelectors): boolean {
  if (sel.provencePaintWood) return true
  return (
    (sel.headboard?.length ?? 0) > 1 ||
    (sel.upholstery?.length ?? 0) > 1 ||
    (sel.wood?.length ?? 0) > 1 ||
    (sel.finish?.length ?? 0) > 1
  )
}

const EXECUTION_LABELS: Record<string, string> = {
  [NEUTRAL_KEY]: "Основной",
  blue: "Голубой",
  grey: "Серый",
  gray: "Серый",
  cream: "Кремовый",
  milk: "Молочный",
  olive: "Оливковый",
  green: "Зелёный",
  white: "Белый",
  beige: "Бежевый",
  black: "Чёрный",
  brown: "Коричневый",
  graphite: "Графит",
  ivory: "Слоновая кость",
  dark: "Тёмный",
  cacao: "Какао",
  capuchino: "Капучино",
  powder: "Пудра",
  terracote: "Терракота",
  darkblue: "Син-серый",
  "grey-blue": "Серо-голубой",
  frame: "Каркас",
  cloud: "Cloud",
  plane: "Plane",
  velvet: "Велюр",
  linen: "Лён",
  oak: "Дуб",
  walnut: "Орех",
  wenge: "Венге",
}

const META_EXECUTION_KEYS = [
  "decor",
  "color_label",
  "finish",
  "fabric",
  "upholstery",
  "wood_finish",
  "material",
] as const

/** Color token from filename/path (buyer catalog; mirrors QA board heuristics). */
export function extractColorTokenFromUrl(url: string): string | null {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  const explicit = hay.match(/(?:color|colour)[_-]([a-z0-9-]+)/)
  if (explicit?.[1]) return explicit[1].toLowerCase()
  const named = hay.match(
    /(?:^|[-_])(blue|grey|gray|cream|milk|olive|green|white|beige|black|brown|graphite|ivory|dark)(?:[-_.]|$)/i
  )
  return named?.[1]?.toLowerCase() ?? null
}

/** Material / upholstery / finish token from filename. */
export function extractMaterialTokenFromUrl(url: string): string | null {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  const m = hay.match(
    /[-_](frame|cloud|plane|velvet|linen|fabric|upholstery|oak|walnut|wenge)(?:[-_.0-9]|$)/i
  )
  return m?.[1]?.toLowerCase() ?? null
}

/** Paint color or material/finish token for execution grouping. */
export function extractExecutionTokenFromUrl(url: string): string | null {
  return (
    extractGreenwichFinishTokenFromUrl(url) ??
    extractColorTokenFromUrl(url) ??
    extractMaterialTokenFromUrl(url)
  )
}

/** Greenwich legacy filenames: greenwich_{finish}07…, greenwich_dark_{finish}…, grey-blue04, etc. */
export function extractGreenwichFinishTokenFromUrl(url: string): string | null {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  if (!/greenwich|gr-\d{2}-\d/i.test(hay)) return null

  const darkCompound = hay.match(
    /greenwich[_-]dark[_-](grey-blue|darkblue|white|cacao|powder|cream|terracote|graphite|green|olive|capuchino|grey)(?:\d{2}|[_\-.])/i
  )
  if (darkCompound?.[1]) return darkCompound[1].toLowerCase()

  const numbered = hay.match(
    /greenwich[_-](grey-blue|darkblue|white|cacao|powder|cream|terracote|graphite|green|olive|capuchino|grey)(?:\d{2}|07|08|09|04|05|06|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)(?:[_\-.]|$)/i
  )
  if (numbered?.[1]) return numbered[1].toLowerCase()

  const legacy07 = hay.match(/greenwich[_-]([a-z0-9-]+?)07(?:[_-]|\.)/i)
  if (legacy07?.[1]) {
    const raw = legacy07[1].toLowerCase()
    if (raw === "dark" && hay.includes("dark_white")) return "white"
    if (raw === "dark" && hay.includes("darkblue")) return "darkblue"
    if (raw.startsWith("dark_")) return raw.slice(5)
    return raw
  }

  const skuDark = hay.match(
    /[_-]dark[_-](grey-brown|cacao|powder|cream|terracote|graphite|green|olive|capuchino|grey|white)/i
  )
  if (skuDark?.[1]) {
    const t = skuDark[1].toLowerCase()
    return t === "grey-brown" ? "cacao" : t
  }

  return null
}

/** Non-finish detail/size assets that must not lead a color swatch bucket. */
export function isGreenwichNeutralDetailAsset(url: string): boolean {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  if (/\d{4}-\d{2}-\d{2}/.test(hay)) return true
  if (/sizes\d|габарит|наполнение|noliver_var|bedroom|wideheader|view0/i.test(hay)) return true
  if (!extractGreenwichFinishTokenFromUrl(url)) return true
  return false
}

export function isHeadboardModelToken(
  token: string,
  product?: Record<string, unknown>
): boolean {
  if (!HEADBOARD_MODEL_TOKENS.has(token)) return false
  const meta = product?.metadata as Record<string, unknown> | undefined
  if (meta?.display_group === "greenwich-bed") return true
  const handle = (product?.handle as string | undefined)?.toLowerCase() ?? ""
  if (handle.startsWith("greenwich-gr-") || handle.startsWith("gr-")) {
    const urls = collectProductImageUrls(product ?? {})
    if (urls.some((u) => /gr-bed-pool|[-_](frame|cloud|plane)[-_.0-9]/i.test(u))) {
      return true
    }
  }
  return false
}

export function extractHeadboardTagFromUrl(url: string): string | null {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  const m = hay.match(/[-_](frame|cloud|plane)(?:[-_.0-9]|$)/i)
  return m?.[1]?.toLowerCase() ?? null
}

export function isUpholsteredProduct(product: Record<string, unknown>): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  if (meta?.display_group === "greenwich-bed") return true
  const title = (product.title as string | undefined) ?? ""
  if (/кровать/i.test(title)) return true
  const urls = collectProductImageUrls(product)
  return urls.some((u) =>
    /velvet|linen|fabric|upholstery/i.test(u.split("/").pop() ?? u)
  )
}

function bucketProductImages(product: Record<string, unknown>): {
  upholsteryBuckets: Map<string, string[]>
  woodBuckets: Map<string, string[]>
  modelBuckets: Map<string, string[]>
} {
  const urls = Array.from(
    new Set(collectProductImageUrls(product).filter(Boolean))
  )
  const upholsteryBuckets = new Map<string, string[]>()
  const woodBuckets = new Map<string, string[]>()
  const modelBuckets = new Map<string, string[]>()
  const upholstered = isUpholsteredProduct(product)

  for (const url of urls) {
    const colorToken =
      extractGreenwichFinishTokenFromUrl(url) ?? extractColorTokenFromUrl(url)
    const materialToken = extractMaterialTokenFromUrl(url)
    const headboardTag = extractHeadboardTagFromUrl(url)

    if (
      materialToken &&
      isHeadboardModelToken(materialToken, product) &&
      !colorToken
    ) {
      const arr = modelBuckets.get(materialToken) ?? []
      arr.push(url)
      modelBuckets.set(materialToken, arr)
      continue
    }

    if (headboardTag && !colorToken && !materialToken) {
      const arr = modelBuckets.get(headboardTag) ?? []
      arr.push(url)
      modelBuckets.set(headboardTag, arr)
      continue
    }

    if (materialToken && UPHOLSTERY_MATERIAL_TOKENS.has(materialToken)) {
      const arr = upholsteryBuckets.get(materialToken) ?? []
      arr.push(url)
      upholsteryBuckets.set(materialToken, arr)
      continue
    }

    if (materialToken && WOOD_MATERIAL_TOKENS.has(materialToken)) {
      const arr = woodBuckets.get(materialToken) ?? []
      arr.push(url)
      woodBuckets.set(materialToken, arr)
      continue
    }

    if (colorToken) {
      const target = upholstered ? upholsteryBuckets : woodBuckets
      const arr = target.get(colorToken) ?? []
      arr.push(url)
      target.set(colorToken, arr)
      continue
    }

    if (materialToken && !isHeadboardModelToken(materialToken, product)) {
      const arr = woodBuckets.get(materialToken) ?? []
      arr.push(url)
      woodBuckets.set(materialToken, arr)
      continue
    }

    const neutralTarget = upholstered ? upholsteryBuckets : woodBuckets
    const arr = neutralTarget.get(NEUTRAL_KEY) ?? []
    arr.push(url)
    neutralTarget.set(NEUTRAL_KEY, arr)
  }

  return { upholsteryBuckets, woodBuckets, modelBuckets }
}

export function executionLabelForToken(
  token: string | null | undefined,
  product?: Record<string, unknown>
): string {
  if (product && token) {
    const labelMaps = [
      labelsFromMetadata(product, "paint_finish_labels", "finish_color_labels"),
      labelsFromMetadata(product, "fabric_upholstery_labels", "upholstery_color_labels"),
      labelsFromMetadata(product, "frame_material_labels"),
      labelsFromMetadata(product, "construction_tier_labels", "material_tier_labels"),
    ]
    for (const labels of labelMaps) {
      const fromMap = labels?.[token]
      if (typeof fromMap === "string" && fromMap.trim()) return fromMap.trim()
    }
  }
  if (product) {
    const meta = product.metadata as Record<string, unknown> | undefined
    for (const key of META_EXECUTION_KEYS) {
      const v = meta?.[key]
      if (typeof v === "string" && v.trim()) return v.trim()
    }
  }
  if (!token) return EXECUTION_LABELS[NEUTRAL_KEY]!
  return EXECUTION_LABELS[token] ?? token
}

export function swatchTokenForProduct(
  product: Record<string, unknown>
): string | null {
  const meta = product.metadata as Record<string, unknown> | undefined
  for (const key of ["color_label", "decor", "finish", "fabric"] as const) {
    const v = meta?.[key]
    if (typeof v === "string" && v.trim()) {
      const norm = v.trim().toLowerCase()
      if (EXECUTION_LABELS[norm]) return norm
    }
  }
  const thumb = cardThumbnailSrcFromProduct(product)
  return thumb ? extractExecutionTokenFromUrl(thumb) : null
}

export function cardThumbnailSrcFromProduct(
  product: Record<string, unknown>
): string {
  const t = product.thumbnail
  if (typeof t === "string") {
    const s = t.trim()
    if (s.length > 0) return resolveStorefrontProductImageSrc(s)
  }
  const images = product.images
  if (Array.isArray(images) && images.length > 0) {
    const u = normalizeImageEntryUrl(images[0])
    if (u) return resolveStorefrontProductImageSrc(u)
  }
  return ""
}

function metaExecutionSignature(product: Record<string, unknown>): string | null {
  const meta = product.metadata as Record<string, unknown> | undefined
  if (!meta) return null
  const parts: string[] = []
  for (const key of META_EXECUTION_KEYS) {
    const v = meta[key]
    if (typeof v === "string" && v.trim()) {
      parts.push(`${key}:${v.trim().toLowerCase()}`)
    }
  }
  return parts.length > 0 ? parts.join("|") : null
}

/** Signature for display_group members — size-only duplicates share thumb URL. */
export function executionSignatureForGroupMember(
  product: Record<string, unknown>
): string {
  const fromMeta = metaExecutionSignature(product)
  if (fromMeta) return fromMeta

  const thumb = cardThumbnailSrcFromProduct(product)
  const token = thumb ? extractExecutionTokenFromUrl(thumb) : null
  if (token) return `token:${token}`

  // Size-only display_group members: no per-SKU thumb differentiation.
  return "execution:neutral"
}

function pickMainForBucket(
  urls: string[],
  preferredMain?: string
): { main: string; extras: string[] } {
  const list = urls.filter((u) => typeof u === "string" && u.trim())
  if (list.length === 0) return { main: "", extras: [] }
  const pref = preferredMain?.trim()
  if (pref && list.includes(pref)) {
    return { main: pref, extras: list.filter((u) => u !== pref) }
  }
  const mainCandidate =
    list.find((u) => /_main\.(jpe?g|png|webp)$/i.test(u)) ??
    list.find((u) => /_01\.(jpe?g|png|webp)$/i.test(u)) ??
    list[0]!
  return { main: mainCandidate, extras: list.filter((u) => u !== mainCandidate) }
}

function buildExecutionVariantsFromBuckets(
  buckets: Map<string, string[]>,
  mainNorm: string,
  product?: Record<string, unknown>
): CardColorVariant[] {
  const executionBuckets = Array.from(buckets.keys()).filter(
    (k) => k !== NEUTRAL_KEY
  )
  if (executionBuckets.length === 0) return []

  const variants: CardColorVariant[] = []
  const orderedKeys = [
    ...(buckets.has(NEUTRAL_KEY) ? [NEUTRAL_KEY] : []),
    ...executionBuckets.sort(),
  ]

  for (const token of orderedKeys) {
    const bucketUrls = buckets.get(token) ?? []
    const preferred =
      token === NEUTRAL_KEY && mainNorm ? mainNorm : undefined
    const { main, extras } = pickMainForBucket(bucketUrls, preferred)
    if (!main && extras.length === 0) continue
    variants.push({
      key: token,
      label: executionLabelForToken(
        token === NEUTRAL_KEY ? null : token,
        product
      ),
      mainSrc: main,
      extraSrcs: extras,
      swatchToken: token === NEUTRAL_KEY ? null : token,
    })
  }
  return variants
}

/**
 * Intra-SKU execution buckets from image filenames (color_* or material tokens).
 */
export function buildIntraProductColorVariants(
  product: Record<string, unknown>,
  mainSrc: string
): CardColorVariant[] | undefined {
  const selectors = buildIntraProductExecutionSelectors(product, mainSrc)
  const wood = selectors.wood
  const upholstery = selectors.upholstery
  const finish = selectors.finish
  if (wood && wood.length > 1 && (!upholstery || upholstery.length <= 1)) {
    return wood
  }
  if (upholstery && upholstery.length > 1 && (!wood || wood.length <= 1)) {
    return upholstery
  }
  if (finish && finish.length > 1) return finish
  if (wood && wood.length > 1) return wood
  if (upholstery && upholstery.length > 1) return upholstery
  return undefined
}

export function finishLabelForProduct(
  product: Record<string, unknown>
): "Цвет" | "Отделка" {
  const handle = ((product.handle as string | undefined) ?? "").toLowerCase()
  if (handle.startsWith("co-")) return "Отделка"
  const meta = product.metadata as Record<string, unknown> | undefined
  const workbook = meta?.workbook_row_key
  if (typeof workbook === "string" && workbook.toLowerCase().startsWith("country")) {
    return "Отделка"
  }
  return "Цвет"
}

function colorExecutionsFromMetadataArray(
  raw: unknown,
  opts?: { handle?: string }
): CardColorVariant[] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined
  const variants: CardColorVariant[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    const key = typeof o.key === "string" ? o.key : null
    const label = typeof o.label === "string" ? o.label.trim() : ""
    const urls = Array.isArray(o.urls)
      ? o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : []
    const swatchHex =
      typeof o.swatch_hex === "string" && o.swatch_hex.trim().length > 0
        ? o.swatch_hex.trim()
        : null
    if (!key || !label || urls.length === 0) {
      if (!key || !label || !swatchHex) continue
      variants.push({
        key,
        label,
        mainSrc: "",
        extraSrcs: [],
        swatchToken: key,
        swatchHex,
      })
      continue
    }
    const resolvedUrls = urls.map((u) => resolveStorefrontProductImageSrc(u))
    const main = resolvedUrls[0]!
    variants.push({
      key,
      label,
      mainSrc: main,
      extraSrcs: resolvedUrls.slice(1),
      swatchToken: key,
      swatchHex,
    })
  }
  return variants.length > 1 ? variants : undefined
}

function metadataExecutionsRaw(
  product: Record<string, unknown>,
  ...keys: string[]
): unknown {
  const meta = product.metadata as Record<string, unknown> | undefined
  if (!meta) return undefined
  for (const key of keys) {
    const v = meta[key]
    if (Array.isArray(v) && v.length > 0) return v
  }
  return undefined
}

function labelsFromMetadata(
  product: Record<string, unknown>,
  ...keys: string[]
): Record<string, string> | undefined {
  const meta = product.metadata as Record<string, unknown> | undefined
  if (!meta) return undefined
  for (const key of keys) {
    const v = meta[key]
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, string>
    }
  }
  return undefined
}

function finishExecutionsFromMetadata(
  product: Record<string, unknown>
): CardColorVariant[] | undefined {
  const handle = typeof product.handle === "string" ? product.handle : undefined
  const meta = product.metadata as Record<string, unknown> | undefined
  if (shouldSuppressOliverFinishWhenFabricCanonical(handle, meta)) {
    return undefined
  }
  const raw = metadataExecutionsRaw(
    product,
    "finish_color_executions",
    "paint_finish_executions"
  )
  const urls = collectProductImageUrls(product)
  if (Array.isArray(raw) && isOliverFalseFinishColorSplit(urls, raw as Array<{ key: string; label: string; urls: string[] }>, handle)) {
    return undefined
  }
  const repaired = repairOliverFalseFinishColorExecutions(
    raw as Array<{ key: string; label: string; urls: string[] }> | undefined,
    urls,
    handle
  )
  if (repaired.changed && (repaired.executions?.length ?? 0) < 2) {
    return undefined
  }
  const source = repaired.changed ? repaired.executions : raw
  const variants = colorExecutionsFromMetadataArray(source, { handle })
  if (!variants || variants.length < 2) return variants
  const h = handle?.toLowerCase() ?? ""
  if (h.startsWith("pv-")) {
    if (meta?.finish_metadata_source !== "provence_paint_wood_split") return undefined
    if (!hasProvencePaintWoodDualFinishEvidence(urls, handle)) return undefined
  }
  if (!h.startsWith("co-")) return variants
  return [...variants].sort((a, b) => {
    const aMilk = /^(cream|milk|molochny|ivory)$/.test(a.key) || /молоч/i.test(a.label)
    const bMilk = /^(cream|milk|molochny|ivory)$/.test(b.key) || /молоч/i.test(b.label)
    if (aMilk && !bMilk) return -1
    if (!aMilk && bMilk) return 1
    return 0
  })
}

function fabricUpholsteryExecutionsFromMetadata(
  product: Record<string, unknown>
): CardColorVariant[] | undefined {
  const raw = metadataExecutionsRaw(
    product,
    "fabric_upholstery_executions",
    "upholstery_color_executions"
  )
  return colorExecutionsFromMetadataArray(raw)
}

function frameMaterialExecutionsFromMetadata(
  product: Record<string, unknown>
): CardColorVariant[] | undefined {
  const raw = metadataExecutionsRaw(product, "frame_material_executions")
  return colorExecutionsFromMetadataArray(raw)
}

function constructionTierExecutionsFromMetadata(
  product: Record<string, unknown>
): CardColorVariant[] | undefined {
  const raw = metadataExecutionsRaw(
    product,
    "construction_tier_executions",
    "material_tier_executions"
  )
  return colorExecutionsFromMetadataArray(raw)
}

/** @deprecated use fabricUpholsteryExecutionsFromMetadata */
function upholsteryExecutionsFromMetadata(
  product: Record<string, unknown>
): CardColorVariant[] | undefined {
  return fabricUpholsteryExecutionsFromMetadata(product)
}

function materialTierExecutionsFromMetadata(
  product: Record<string, unknown>
): CardColorVariant[] | undefined {
  return constructionTierExecutionsFromMetadata(product)
}

function headboardExecutionsFromMetadata(
  product: Record<string, unknown>
): CardModelVariant[] | undefined {
  const raw = (product.metadata as Record<string, unknown> | undefined)
    ?.headboard_model_executions
  if (!Array.isArray(raw) || raw.length < 2) return undefined
  const variants: CardModelVariant[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    const key = typeof o.key === "string" ? o.key : null
    const label = typeof o.label === "string" ? o.label.trim() : ""
    const urls = Array.isArray(o.urls)
      ? o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : []
    if (!key || !label || urls.length === 0) continue
    const resolved = urls.map((u) => resolveStorefrontProductImageSrc(u))
    variants.push({
      key,
      label,
      mainSrc: resolved[0]!,
      extraSrcs: resolved.slice(1),
      modelToken: key,
    })
  }
  return variants.length > 1 ? variants : undefined
}

function dimensionOnlyColorVariants(
  raw: unknown,
  swatchKey: (key: string) => string | null,
  sampleRegion: "upholstery" | "frame_wood"
): CardColorVariant[] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined
  const variants: CardColorVariant[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    const key = typeof o.key === "string" ? o.key : null
    const label = typeof o.label === "string" ? o.label.trim() : ""
    if (!key || !label) continue
    const swatchHex =
      typeof o.swatch_hex === "string" && o.swatch_hex.trim().length > 0
        ? o.swatch_hex.trim()
        : null
    variants.push({
      key,
      label,
      mainSrc: "",
      extraSrcs: [],
      swatchToken: swatchKey(key),
      swatchSampleRegion: sampleRegion,
      swatchHex,
    })
  }
  return variants.length > 1 ? variants : undefined
}

function greenwichBedSelectorsFromMetadata(
  product: Record<string, unknown>
): CardExecutionSelectors | null {
  if (!isGreenwichBedProduct(product)) return null
  const matrix = greenwichBedMatrixFromProduct(product)
  if (matrix.length < 4) return null

  const headboard = headboardExecutionsFromMetadata(product)
  if (!headboard) return null

  const meta = product.metadata as Record<string, unknown> | undefined
  const wood = dimensionOnlyColorVariants(
    meta?.frame_material_executions,
    (k) => (k === "dark" ? "graphite" : "beige"),
    "frame_wood"
  )
  const upholstery = dimensionOnlyColorVariants(
    meta?.fabric_upholstery_executions,
    (k) => (k === "darkblue" ? "darkblue" : "beige"),
    "upholstery"
  )
  if (!wood || !upholstery) return null

  const defaults = defaultGreenwichBedSelection(matrix)
  const media = resolveGreenwichBedMedia(
    matrix,
    defaults.headboard,
    defaults.frameMaterial,
    defaults.fabric
  )

  return {
    headboard,
    wood,
    upholstery,
    greenwichBedMatrix: matrix,
    confidence: "canonical",
    ...(media && {
      /* default hero hint for cardThumbnail — callers use matrix in gallery core */
    }),
  }
}

function executionKeysMatch(
  a: CardColorVariant[],
  b: CardColorVariant[]
): boolean {
  if (a.length !== b.length || a.length < 2) return false
  const keysA = a.map((v) => v.key).sort().join("\u0000")
  const keysB = b.map((v) => v.key).sort().join("\u0000")
  return keysA === keysB
}

function greenwichPaintSelectorsFromMetadata(
  product: Record<string, unknown>
): CardExecutionSelectors | null {
  if (!isGreenwichPaintProduct(product)) return null
  const matrix = greenwichPaintMatrixFromProduct(product)
  if (matrix.length === 0) return null

  const meta = product.metadata as Record<string, unknown> | undefined
  const finish = buildGreenwichPaintFinishVariants(
    matrix,
    (meta?.paint_finish_executions ?? meta?.finish_color_executions) as Array<{
      key: string
      label: string
      swatch_hex?: string
    }>
  )
  if (!finish || finish.length < 2) return null

  const wood = buildGreenwichPaintWoodVariants(
    matrix,
    meta?.frame_material_executions as Array<{ key: string; label: string; swatch_hex?: string }>
  )
  const hasDualWoodForSomeColor = availablePaintKeys(matrix).some(
    (paint) => availableFrameKeysForPaint(matrix, paint).length > 1
  )
  if (!wood && !hasDualWoodForSomeColor) return null

  return {
    wood: wood ?? [],
    finish,
    finishLabel: "Цвет",
    greenwichPaintMatrix: matrix,
    confidence: "canonical",
  }
}

function isProvencePaintWoodSplitMeta(
  meta: Record<string, unknown> | undefined,
  handle: string
): boolean {
  const h = handle.toLowerCase()
  if (!h.startsWith("pv-")) return false
  return meta?.finish_metadata_source === "provence_paint_wood_split"
}

function provencePaintWoodSelectorsFromMetadata(
  product: Record<string, unknown>
): CardExecutionSelectors | null {
  const handle = typeof product.handle === "string" ? product.handle : ""
  const meta = product.metadata as Record<string, unknown> | undefined
  if (!isProvencePaintWoodSplitMeta(meta, handle)) return null
  const urls = collectProductImageUrls(product)
  if (!hasProvencePaintWoodDualFinishEvidence(urls, handle)) return null

  const variants = colorExecutionsFromMetadataArray(meta?.finish_color_executions, {
    handle,
  })
  if (!variants || variants.length < 2) return null
  const cream = variants.find((v) => v.key === "cream")
  const wood = variants.find((v) => v.key === "wood")
  if (!cream || !wood) return null

  return {
    finish: [cream],
    finishLabel: "Цвет",
    wood: [wood],
    provencePaintWood: true,
    confidence: "canonical",
  }
}

export function buildIntraProductExecutionSelectors(
  product: Record<string, unknown>,
  mainSrc: string
): CardExecutionSelectors {
  const greenwichBed = greenwichBedSelectorsFromMetadata(product)
  if (greenwichBed) return greenwichBed

  const greenwichPaint = greenwichPaintSelectorsFromMetadata(product)
  if (greenwichPaint) return greenwichPaint

  const provencePaintWood = provencePaintWoodSelectorsFromMetadata(product)
  if (provencePaintWood) return provencePaintWood

  const metadataHeadboard = headboardExecutionsFromMetadata(product)
  const metadataFabric = fabricUpholsteryExecutionsFromMetadata(product)
  const metadataPaint = finishExecutionsFromMetadata(product)
  const metadataFrame = frameMaterialExecutionsFromMetadata(product)
  const metadataConstruction = constructionTierExecutionsFromMetadata(product)

  if (metadataHeadboard) {
    const out: CardExecutionSelectors = {
      headboard: metadataHeadboard,
      confidence: "canonical",
    }
    if (metadataFabric) out.upholstery = metadataFabric
    if (metadataPaint) {
      out.finish = metadataPaint
      out.finishLabel = finishLabelForProduct(product)
    }
    return out
  }

  if (metadataConstruction) {
    return {
      finish: metadataConstruction,
      finishLabel: "Конструкция",
      confidence: "canonical",
    }
  }

  if (metadataPaint && metadataFabric) {
    if (
      executionKeysMatch(metadataPaint, metadataFabric) ||
      shouldSuppressOliverFinishWhenFabricCanonical(
        typeof product.handle === "string" ? product.handle : undefined,
        product.metadata as Record<string, unknown> | undefined
      )
    ) {
      return {
        upholstery: metadataFabric,
        wood: metadataFrame,
        confidence: "canonical",
      }
    }
    return {
      finish: metadataPaint,
      finishLabel: finishLabelForProduct(product),
      upholstery: metadataFabric,
      wood: metadataFrame,
      confidence: "canonical",
    }
  }

  if (metadataPaint) {
    const out: CardExecutionSelectors = {
      finish: metadataPaint,
      finishLabel: finishLabelForProduct(product),
      confidence: "canonical",
    }
    if (metadataFrame) out.wood = metadataFrame
    return out
  }

  if (metadataFabric) {
    return {
      upholstery: metadataFabric,
      wood: metadataFrame,
      confidence: "canonical",
    }
  }

  if (metadataFrame) {
    return {
      wood: metadataFrame,
      confidence: "canonical",
    }
  }

  const metadataMaterialTier = materialTierExecutionsFromMetadata(product)
  if (metadataMaterialTier) {
    return {
      finish: metadataMaterialTier,
      finishLabel: "Конструкция",
      confidence: "canonical",
    }
  }

  const mainNorm = mainSrc.trim()
  const productUrls = collectProductImageUrls(product)
  const handle = typeof product.handle === "string" ? product.handle.toLowerCase() : ""
  if (detectOliverGalleryColorHeroPair(productUrls) && handle.startsWith("ol-")) {
    return { confidence: "metadata_blocked" }
  }

  const { upholsteryBuckets, woodBuckets, modelBuckets } =
    bucketProductImages(product)

  const headboard = buildModelVariantsFromBuckets(modelBuckets, mainNorm)
  const upholstery = buildColorVariantsFromBuckets(
    upholsteryBuckets,
    mainNorm,
    product
  )
  const wood = buildColorVariantsFromBuckets(woodBuckets, mainNorm, product)

  const upholstered = isUpholsteredProduct(product)
  const hasUpholstery = Boolean(upholstery && upholstery.length > 1)
  const hasWood = Boolean(wood && wood.length > 1)

  const out: CardExecutionSelectors = { confidence: "metadata_blocked" }

  if (headboard && headboard.length > 1) out.headboard = headboard

  if (hasUpholstery && hasWood) {
    out.upholstery = upholstery
    out.wood = wood
    out.confidence = "heuristic"
  } else if (hasUpholstery) {
    out.upholstery = upholstery
    out.confidence = "heuristic"
  } else if (hasWood && upholstered) {
    // Upholstered SKU without reliable fabric/wood split — no fake wood row.
    out.confidence = "metadata_blocked"
  } else if (hasWood && !upholstered) {
    out.finish = wood
    out.finishLabel = finishLabelForProduct(product)
    out.confidence = "heuristic"
  } else if (out.headboard) {
    out.confidence = "metadata_blocked"
  }

  return out
}

function buildColorVariantsFromBuckets(
  buckets: Map<string, string[]>,
  mainNorm: string,
  product: Record<string, unknown>
): CardColorVariant[] | undefined {
  const variants = buildExecutionVariantsFromBuckets(buckets, mainNorm, product)
  return variants.length > 1 ? variants : undefined
}

function buildModelVariantsFromBuckets(
  buckets: Map<string, string[]>,
  mainNorm: string
): CardModelVariant[] | undefined {
  const modelTokens = Array.from(buckets.keys()).filter((k) => k !== NEUTRAL_KEY)
  if (modelTokens.length === 0) return undefined

  const variants: CardModelVariant[] = []
  for (const token of modelTokens.sort()) {
    const bucketUrls = buckets.get(token) ?? []
    const { main, extras } = pickMainForBucket(bucketUrls, mainNorm)
    if (!main && extras.length === 0) continue
    variants.push({
      key: `model:${token}`,
      label: EXECUTION_LABELS[token] ?? token,
      mainSrc: main,
      extraSrcs: extras,
      modelToken: token,
    })
  }

  return variants.length > 1 ? variants : undefined
}

/**
 * Headboard / model-shape selectors (frame, cloud, plane) — not color swatches.
 * Interim: filename tokens only; metadata.execution_key not available.
 */
export function buildIntraProductModelVariants(
  product: Record<string, unknown>,
  mainSrc: string
): CardModelVariant[] | undefined {
  return buildIntraProductExecutionSelectors(product, mainSrc).headboard
}

/**
 * Display-group execution swatches — only when members differ by material/color,
 * not by size alone.
 */
export function buildDisplayGroupColorVariants(
  members: Record<string, unknown>[]
): CardColorVariant[] | undefined {
  const bySig = new Map<string, Record<string, unknown>>()
  for (const m of members) {
    const sig = executionSignatureForGroupMember(m)
    if (!bySig.has(sig)) bySig.set(sig, m)
  }
  if (bySig.size <= 1) return undefined

  const variants = Array.from(bySig.entries()).map(([sig, m]) => {
    const mainSrc = cardThumbnailSrcFromProduct(m)
    const token = swatchTokenForProduct(m)
    return {
      key: sig,
      label: executionLabelForToken(token, m),
      mainSrc,
      extraSrcs: collectExtraProductImageUrls(m, mainSrc),
      swatchToken: token,
    }
  })

  return variants.length > 1 ? variants : undefined
}
