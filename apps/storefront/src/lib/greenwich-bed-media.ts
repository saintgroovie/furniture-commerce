/**
 * Greenwich bed matrix resolution for card / PDP media.
 */
import type { CardColorVariant } from "./card-color-media"
import { resolveStorefrontProductImageSrc } from "./product-images"

export type GreenwichBedMatrixEntry = {
  headboard_model: string
  frame_material: string
  fabric_upholstery: string
  combo_key?: string
  label?: string
  urls: string[]
}

export function isGreenwichBedProduct(product: Record<string, unknown>): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  return meta?.display_group === "greenwich-bed"
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

export function resolveGreenwichBedMedia(
  matrix: GreenwichBedMatrixEntry[],
  headboard: string,
  frameMaterial: string,
  fabric: string
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
  const resolved = entry.urls.map((u) => resolveStorefrontProductImageSrc(u))
  return {
    mainSrc: resolved[0]!,
    extraSrcs: resolved.slice(1),
  }
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
