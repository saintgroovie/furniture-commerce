import {
  collectExtraProductImageUrls,
  collectProductImageUrls,
  normalizeImageEntryUrl,
  resolveMedusaBackendImageUrl,
} from "./product-images"

export type CardColorVariant = {
  key: string
  label: string
  mainSrc: string
  extraSrcs: string[]
  /** CSS chip token for rounded-square swatch fill fallback */
  swatchToken?: string | null
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
  finishLabel?: "Цвет" | "Отделка"
  confidence: CardExecutionConfidence
}

export type CardExecutionControls = CardExecutionSelectors

const EXECUTION_LABELS: Record<string, string> = {
  [NEUTRAL_KEY]: "Основной",
  blue: "Синий",
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

/** Greenwich legacy filenames: greenwich_{finish}07_*.jpg */
export function extractGreenwichFinishTokenFromUrl(url: string): string | null {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  const m = hay.match(/greenwich[_-]([a-z0-9-]+?)07(?:[_-]|\.)/i)
  if (!m?.[1]) return null
  const raw = m[1].toLowerCase()
  if (raw === "dark" && hay.includes("dark_white")) return "white"
  if (raw === "dark" && hay.includes("darkblue")) return "darkblue"
  return raw
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
    const labels = (product.metadata as Record<string, unknown> | undefined)
      ?.finish_color_labels as Record<string, string> | undefined
    const fromMap = labels?.[token]
    if (typeof fromMap === "string" && fromMap.trim()) return fromMap.trim()
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
    if (s.length > 0) return s
  }
  const images = product.images
  if (Array.isArray(images) && images.length > 0) {
    const u = normalizeImageEntryUrl(images[0])
    if (u) return u
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

function finishExecutionsFromMetadata(
  product: Record<string, unknown>
): CardColorVariant[] | undefined {
  const raw = (product.metadata as Record<string, unknown> | undefined)
    ?.finish_color_executions
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
    if (!key || !label || urls.length === 0) continue
    const resolvedUrls = urls.map((u) => resolveMedusaBackendImageUrl(u))
    const main = resolvedUrls[0]!
    variants.push({
      key,
      label,
      mainSrc: main,
      extraSrcs: resolvedUrls.slice(1),
      swatchToken: key,
    })
  }
  return variants.length > 1 ? variants : undefined
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
    const resolved = urls.map((u) => resolveMedusaBackendImageUrl(u))
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

export function buildIntraProductExecutionSelectors(
  product: Record<string, unknown>,
  mainSrc: string
): CardExecutionSelectors {
  const metadataHeadboard = headboardExecutionsFromMetadata(product)
  if (metadataHeadboard) {
    return {
      headboard: metadataHeadboard,
      confidence: "canonical",
    }
  }

  const metadataFinish = finishExecutionsFromMetadata(product)
  if (metadataFinish) {
    return {
      finish: metadataFinish,
      finishLabel: finishLabelForProduct(product),
      confidence: "canonical",
    }
  }

  const mainNorm = mainSrc.trim()
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
