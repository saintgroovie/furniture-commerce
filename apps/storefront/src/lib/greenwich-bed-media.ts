/**
 * Greenwich bed matrix resolution for card / PDP media.
 *
 * Gallery strip contract (buyer-facing):
 *   active combo photos → audited neutral_detail allowlist → shared interiors
 * Foreign combo tokens are always dropped. Unscoped pool shots (no combo token)
 * are hidden unless allowlisted as neutral_detail.
 */
import type { CardColorVariant } from "./card-color-media"
import { resolveStorefrontProductImageSrc } from "./product-images"

export type GreenwichBedComboKey =
  | "natural_beige"
  | "dark_beige"
  | "natural_darkblue"
  | "dark_darkblue"

/** Exact known combo tokens — match as whole tokens, never substrings like `dark`. */
export const GREENWICH_BED_COMBO_KEYS: readonly GreenwichBedComboKey[] = [
  "natural_beige",
  "dark_beige",
  "natural_darkblue",
  "dark_darkblue",
] as const

const COMBO_TOKEN_RE = /(natural_beige|dark_beige|natural_darkblue|dark_darkblue)/i

export type GreenwichBedMatrixEntry = {
  headboard_model: string
  frame_material: string
  fabric_upholstery: string
  combo_key?: string
  label?: string
  urls: string[]
}

export type GreenwichBedSharedScene = {
  key: string
  label: string
  urls: string[]
  scene_type: string
}

/** Empty by default — only audited basenames may be added later. */
export const GREENWICH_BED_NEUTRAL_DETAIL_ALLOWLIST: ReadonlySet<string> = new Set()

export function isGreenwichBedProduct(product: Record<string, unknown>): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  return meta?.display_group === "greenwich-bed"
}

/** Basename without query/hash, lowercased. */
export function greenwichBedImageBasename(url: string): string {
  const path = url.split("?")[0]?.split("#")[0] ?? url
  return (path.split("/").pop() ?? path).toLowerCase()
}

/** Exact combo token from basename, or null when unscoped / unknown. */
export function parseGreenwichBedComboKey(urlOrFilename: string): GreenwichBedComboKey | null {
  const file = greenwichBedImageBasename(urlOrFilename)
  const m = file.match(COMBO_TOKEN_RE)
  if (!m?.[1]) return null
  const key = m[1].toLowerCase() as GreenwichBedComboKey
  return GREENWICH_BED_COMBO_KEYS.includes(key) ? key : null
}

export function isGreenwichBedInteriorUrl(url: string): boolean {
  return /bedroom\d*_int_|_int_view/i.test(greenwichBedImageBasename(url))
}

export function comboKeyFromDimensions(
  frameMaterial: string,
  fabric: string
): GreenwichBedComboKey | null {
  const key = `${frameMaterial}_${fabric}`
  return GREENWICH_BED_COMBO_KEYS.includes(key as GreenwichBedComboKey)
    ? (key as GreenwichBedComboKey)
    : null
}

/**
 * Scope a cell URL list to the active combo.
 * Keeps from the cell: active-combo tagged shots + allowlisted neutral_detail.
 * Drops: foreign combo tokens, unclassified unscoped pool, and interior-looking
 * filenames that appear only inside the cell (interiors must come from
 * `interiorUrls` / shared_scene_media).
 * Appends `interiorUrls` last.
 */
export function scopeGreenwichBedGalleryUrls(
  urls: string[],
  activeCombo: GreenwichBedComboKey,
  options?: {
    interiorUrls?: string[]
    neutralDetailAllowlist?: ReadonlySet<string>
  }
): { mainSrc: string; extraSrcs: string[] } | null {
  if (urls.length === 0) return null
  const allow = options?.neutralDetailAllowlist ?? GREENWICH_BED_NEUTRAL_DETAIL_ALLOWLIST
  const resolved = urls.map((u) => resolveStorefrontProductImageSrc(u))
  const hero = resolved[0]!
  const comboExtras: string[] = []
  const neutralExtras: string[] = []
  const seen = new Set<string>([normalizeUrlKey(hero)])

  const consider = (src: string, bucket: "combo" | "neutral") => {
    const key = normalizeUrlKey(src)
    if (seen.has(key)) return
    seen.add(key)
    if (bucket === "combo") comboExtras.push(src)
    else neutralExtras.push(src)
  }

  for (const src of resolved.slice(1)) {
    const combo = parseGreenwichBedComboKey(src)
    if (combo) {
      if (combo === activeCombo) consider(src, "combo")
      continue
    }
    /* Interior-looking names in the cell are not trusted — only shared_scene. */
    if (isGreenwichBedInteriorUrl(src)) continue
    if (allow.has(greenwichBedImageBasename(src))) {
      consider(src, "neutral")
      continue
    }
    /* unscoped / unknown → hide */
  }

  const interiorExtras: string[] = []
  for (const interior of options?.interiorUrls ?? []) {
    if (typeof interior !== "string" || !interior.trim()) continue
    const src = resolveStorefrontProductImageSrc(interior)
    const key = normalizeUrlKey(src)
    if (seen.has(key)) continue
    seen.add(key)
    interiorExtras.push(src)
  }

  return {
    mainSrc: hero,
    extraSrcs: [...comboExtras, ...neutralExtras, ...interiorExtras],
  }
}

function normalizeUrlKey(url: string): string {
  return resolveStorefrontProductImageSrc(url).split("?")[0]?.split("#")[0] ?? url
}

export function greenwichBedMatrixFromProduct(
  product: Record<string, unknown>
): GreenwichBedMatrixEntry[] {
  const meta = product.metadata as Record<string, unknown> | undefined
  const raw = meta?.bed_execution_matrix
  if (!Array.isArray(raw)) return []
  const out: GreenwichBedMatrixEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    const headboard_model = typeof o.headboard_model === "string" ? o.headboard_model : ""
    const frame_material = typeof o.frame_material === "string" ? o.frame_material : ""
    const fabric_upholstery =
      typeof o.fabric_upholstery === "string" ? o.fabric_upholstery : ""
    const urls = Array.isArray(o.urls)
      ? o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : []
    if (!headboard_model || !frame_material || !fabric_upholstery || urls.length === 0) {
      continue
    }
    out.push({
      headboard_model,
      frame_material,
      fabric_upholstery,
      combo_key: typeof o.combo_key === "string" ? o.combo_key : undefined,
      label: typeof o.label === "string" ? o.label : undefined,
      urls,
    })
  }
  return out
}

/** Interior URLs from `metadata.shared_scene_media` (scene_type === interior only). */
export function greenwichBedInteriorUrlsFromProduct(
  product: Record<string, unknown>
): string[] {
  const meta = product.metadata as Record<string, unknown> | undefined
  const raw = meta?.shared_scene_media
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    if (o.scene_type !== "interior") continue
    const urls = Array.isArray(o.urls) ? o.urls : []
    for (const u of urls) {
      if (typeof u !== "string" || !u.trim()) continue
      const key = normalizeUrlKey(u)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(u.trim())
    }
  }
  return out
}

export function resolveGreenwichBedMedia(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string,
  frameMaterial: string,
  fabric: string,
  options?: {
    interiorUrls?: string[]
    neutralDetailAllowlist?: ReadonlySet<string>
  }
): { mainSrc: string; extraSrcs: string[] } | null {
  const entry =
    matrix.find(
      (m) =>
        m.headboard_model === headboard &&
        m.frame_material === frameMaterial &&
        m.fabric_upholstery === fabric
    ) ??
    matrix.find(
      (m) =>
        m.headboard_model === headboard &&
        m.combo_key === `${frameMaterial}_${fabric}`
    )
  if (!entry || entry.urls.length === 0) return null

  const activeCombo =
    (entry.combo_key && parseGreenwichBedComboKey(entry.combo_key)) ||
    comboKeyFromDimensions(frameMaterial, fabric) ||
    comboKeyFromDimensions(entry.frame_material, entry.fabric_upholstery)

  if (!activeCombo) {
    /* Degenerate metadata: keep hero only, never leak unscoped pool. */
    const resolved = entry.urls.map((u) => resolveStorefrontProductImageSrc(u))
    return { mainSrc: resolved[0]!, extraSrcs: [] }
  }

  return scopeGreenwichBedGalleryUrls(entry.urls, activeCombo, options)
}

export function defaultGreenwichBedSelection(matrix: GreenwichBedMatrixEntry[]): {
  headboard: string
  frameMaterial: string
  fabric: string
} {
  const first =
    matrix.find(
      (m) => m.headboard_model === "frame" && m.combo_key === "natural_beige"
    ) ?? matrix[0]
  if (!first) {
    return { headboard: "frame", frameMaterial: "natural", fabric: "beige" }
  }
  return {
    headboard: first.headboard_model,
    frameMaterial: first.frame_material,
    fabric: first.fabric_upholstery,
  }
}

export function availableWoodKeysForHeadboard(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string
): string[] {
  const keys = new Set<string>()
  for (const m of matrix) {
    if (m.headboard_model === headboard) keys.add(m.frame_material)
  }
  return ["natural", "dark"].filter((k) => keys.has(k))
}

export function availableFabricKeysForHeadboard(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string,
  frameMaterial: string
): string[] {
  const keys = new Set<string>()
  for (const m of matrix) {
    if (m.headboard_model === headboard && m.frame_material === frameMaterial) {
      keys.add(m.fabric_upholstery)
    }
  }
  return ["beige", "darkblue"].filter((k) => keys.has(k))
}

/** All fabrics offered for a headboard across its woods - the stable
    «Обивка» row: fabric options must not appear/disappear when wood flips. */
export function availableFabricKeysForHeadboardAnyWood(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string
): string[] {
  const keys = new Set<string>()
  for (const m of matrix) {
    if (m.headboard_model === headboard) keys.add(m.fabric_upholstery)
  }
  return ["beige", "darkblue"].filter((k) => keys.has(k))
}

/** Fabric pick wins: keep the chosen fabric and flip wood to a supporting
    one if the current wood has no such combo (constructor logic - a click
    on a fabric must never silently revert to another fabric). */
export function coerceGreenwichBedSelectionFabricFirst(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string,
  fabric: string,
  frameMaterial?: string | null
): { headboard: string; frameMaterial: string; fabric: string } {
  const woodsWithFabric = availableWoodKeysForHeadboard(matrix, headboard).filter(
    (w) => availableFabricKeysForHeadboard(matrix, headboard, w).includes(fabric)
  )
  if (woodsWithFabric.length === 0) {
    return coerceGreenwichBedSelection(matrix, headboard, frameMaterial, null)
  }
  const wood =
    frameMaterial && woodsWithFabric.includes(frameMaterial)
      ? frameMaterial
      : woodsWithFabric[0]!
  return { headboard, frameMaterial: wood, fabric }
}

/** Snap to nearest valid matrix cell for headboard (and optional wood/fabric hints). */
export function coerceGreenwichBedSelection(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string,
  frameMaterial?: string | null,
  fabric?: string | null
): { headboard: string; frameMaterial: string; fabric: string } {
  const woods = availableWoodKeysForHeadboard(matrix, headboard)
  const wood = frameMaterial && woods.includes(frameMaterial) ? frameMaterial : woods[0] ?? "natural"
  const fabrics = availableFabricKeysForHeadboard(matrix, headboard, wood)
  const fab = fabric && fabrics.includes(fabric) ? fabric : fabrics[0] ?? "beige"
  return { headboard, frameMaterial: wood, fabric: fab }
}

/** Stable pipette source for wood swatch — independent of active fabric selection. */
export function swatchHeroForWood(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string,
  woodKey: string
): string | null {
  const fabrics = availableFabricKeysForHeadboard(matrix, headboard, woodKey)
  const fabric = fabrics.includes("beige") ? "beige" : fabrics[0]
  if (!fabric) return null
  return resolveGreenwichBedMedia(matrix, headboard, woodKey, fabric)?.mainSrc ?? null
}

/** Stable pipette source for fabric swatch — independent of active wood selection. */
export function swatchHeroForFabric(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string,
  fabricKey: string
): string | null {
  for (const wood of availableWoodKeysForHeadboard(matrix, headboard)) {
    if (!availableFabricKeysForHeadboard(matrix, headboard, wood).includes(fabricKey)) {
      continue
    }
    const hero = resolveGreenwichBedMedia(matrix, headboard, wood, fabricKey)?.mainSrc
    if (hero) return hero
  }
  return null
}

/** Matrix-backed swatch variants — URLs stable per headboard (no active wood/fabric coupling). */
export function buildGreenwichBedSwatchVariants(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string,
  woodVariants: CardColorVariant[],
  upholsteryVariants: CardColorVariant[],
  finishVariants?: CardColorVariant[]
): CardColorVariant[] {
  const woods = woodVariants
    .map((v) => {
      const hero = swatchHeroForWood(matrix, headboard, v.key)
      return hero ? { ...v, mainSrc: hero } : v
    })
    .filter((v) => v.mainSrc?.trim())
  const upholstery = upholsteryVariants
    .map((v) => {
      const hero = swatchHeroForFabric(matrix, headboard, v.key)
      return hero ? { ...v, mainSrc: hero } : v
    })
    .filter((v) => v.mainSrc?.trim())
  return [...upholstery, ...woods, ...(finishVariants ?? [])]
}
