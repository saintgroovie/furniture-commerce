/**
 * Gallery dimension metadata contract — paint / frame / fabric / construction / shared.
 */

import {
  fallbackHexForToken,
  withSwatchHexArray,
} from "./dimension-swatch-hex"
import { reconcileOliverFabricFinishMetadata } from "./oliver-finish-execution-guard"
import { hasProvencePaintWoodFinishMetadata, isProvenceFalsePaintWoodSplitMetadata, hasProvencePaintWoodDualFinishEvidence } from "./provence-paint-wood-finish-metadata"

export type ExecutionGroup = { key: string; label: string; urls: string[]; swatch_hex?: string }

export type BedMatrixEntry = {
  headboard_model: string
  fabric_upholstery: string
  urls: string[]
}

export type SharedSceneEntry = {
  key: string
  label: string
  urls: string[]
  scene_type: "interior" | "detail" | "scheme" | "gallery" | "unknown"
}

export const DIMENSION_METADATA_VERSION = 1

export const FABRIC_MOTIF_KEYS = new Set([
  "lillian",
  "lorna",
  "leona",
  "linda",
  "torno",
  "velvet",
  "linen",
])

export const BED_FABRIC_KEYS = new Set([
  "natural_beige",
  "dark_beige",
  "natural_darkblue",
  "dark_darkblue",
])

export const FRAME_WOOD_KEYS = new Set(["oak", "walnut", "wenge"])

const PAINT_FINISH_KEYS = new Set([
  "white",
  "cream",
  "cacao",
  "powder",
  "capuchino",
  "terracote",
  "graphite",
  "green",
  "olive",
  "grey",
  "gray",
  "grey-blue",
  "darkblue",
  "blue",
  "beige",
  "milk",
  "ivory",
  "black",
  "brown",
])

const PAINT_LABELS_RU: Record<string, string> = {
  blue: "Голубой",
  grey: "Серый",
  gray: "Серый",
  cream: "Кремовый",
  white: "Белый",
  olive: "Оливковый",
  green: "Зелёный",
  beige: "Бежевый",
  graphite: "Графит",
  cacao: "Какао",
  capuchino: "Капучино",
  powder: "Пудра",
  terracote: "Терракота",
  darkblue: "Син-серый",
  "grey-blue": "Серо-голубой",
  natural_beige: "Natural / Beige",
  dark_beige: "Dark / Beige",
  natural_darkblue: "Natural / Dark blue",
  dark_darkblue: "Dark / Dark blue",
}

export function labelForDimensionKey(key: string, fallback?: string): string {
  const k = key.toLowerCase()
  return PAINT_LABELS_RU[k] ?? fallback ?? key
}

function asExecutions(raw: unknown): ExecutionGroup[] {
  if (!Array.isArray(raw)) return []
  const out: ExecutionGroup[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    const key = typeof o.key === "string" ? o.key : ""
    const label = typeof o.label === "string" ? o.label.trim() : ""
    const urls = Array.isArray(o.urls)
      ? o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : []
    const swatch_hex =
      typeof o.swatch_hex === "string" && o.swatch_hex.trim().length > 0
        ? o.swatch_hex.trim()
        : undefined
    if (!key || urls.length === 0) continue
    out.push({
      key,
      label: label || labelForDimensionKey(key),
      urls,
      ...(swatch_hex ? { swatch_hex } : {}),
    })
  }
  return out
}

function isFabricKey(key: string, product: Record<string, unknown>): boolean {
  const k = key.toLowerCase()
  if (FABRIC_MOTIF_KEYS.has(k) || BED_FABRIC_KEYS.has(k)) return true
  const title = String(product.title ?? "").toLowerCase()
  const displayGroup = String(
    (product.metadata as Record<string, unknown> | undefined)?.display_group ?? ""
  )
  const upholstered =
    /кровать|банкет|стул|кресл|диван|pouf|bench|chair|bed/i.test(title) ||
    displayGroup === "greenwich-bed"
  if (upholstered && !PAINT_FINISH_KEYS.has(k)) return true
  return false
}

function splitPaintAndFabric(
  paintLike: ExecutionGroup[],
  product: Record<string, unknown>
): { paint: ExecutionGroup[]; fabric: ExecutionGroup[] } {
  const paint: ExecutionGroup[] = []
  const fabric: ExecutionGroup[] = []
  for (const ex of paintLike) {
    const label =
      ex.key === "blue" && (ex.label === "Синий" || !ex.label)
        ? "Голубой"
        : ex.label || labelForDimensionKey(ex.key)
    if (isFabricKey(ex.key, product)) {
      fabric.push({ ...ex, label })
    } else {
      paint.push({ ...ex, label })
    }
  }
  return { paint, fabric }
}

export function buildBedExecutionMatrix(
  headboard: ExecutionGroup[],
  fabric: ExecutionGroup[]
): BedMatrixEntry[] {
  const matrix: BedMatrixEntry[] = []
  const seen = new Set<string>()

  for (const hb of headboard) {
    for (const url of hb.urls) {
      const hay = (url.split("/").pop() ?? url).toLowerCase()
      const m = hay.match(/(natural_beige|dark_beige|natural_darkblue|dark_darkblue)/)
      const fabricKey = m ? m[1]! : null
      if (!fabricKey) continue
      const sig = `${hb.key}|${fabricKey}`
      if (seen.has(sig)) continue
      seen.add(sig)
      const fabricUrls =
        fabric.find((f) => f.key === fabricKey)?.urls.filter((u) => u.includes(fabricKey)) ?? [
          url,
        ]
      matrix.push({
        headboard_model: hb.key,
        fabric_upholstery: fabricKey,
        urls: fabricUrls.length ? fabricUrls : [url],
      })
    }
  }
  return matrix.sort((a, b) =>
    `${a.headboard_model}|${a.fabric_upholstery}`.localeCompare(
      `${b.headboard_model}|${b.fabric_upholstery}`
    )
  )
}

/** Pathname-only key so `/static/…` and `http://host/static/…` match in assigned sets. */
export function normalizeMetadataUrlKey(url: string): string {
  const t = url.trim()
  if (!t) return t
  let path = t
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      path = new URL(t).pathname
    } catch {
      path = t
    }
  }
  return path.toLowerCase()
}

function classifySharedScene(url: string): SharedSceneEntry["scene_type"] {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  if (/scheme|схем|drawing|blueprint/i.test(hay)) return "scheme"
  if (/detail|крупн|handle|knob|hinge/i.test(hay)) return "detail"
  if (/interior|bedroom|_int_|lifestyle|room/i.test(hay)) return "interior"
  if (/gallery|main|hero/i.test(hay)) return "gallery"
  return "unknown"
}

export function buildSharedSceneMedia(
  allUrls: string[],
  assigned: Set<string>
): SharedSceneEntry[] {
  const orphans = allUrls.filter((u) => !assigned.has(normalizeMetadataUrlKey(u)))
  if (orphans.length === 0) return []
  const byType = new Map<SharedSceneEntry["scene_type"], string[]>()
  for (const url of orphans) {
    const t = classifySharedScene(url)
    const arr = byType.get(t) ?? []
    arr.push(url)
    byType.set(t, arr)
  }
  const out: SharedSceneEntry[] = []
  for (const [scene_type, urls] of byType) {
    out.push({
      key: scene_type,
      label:
        scene_type === "interior"
          ? "Интерьер"
          : scene_type === "detail"
            ? "Детали"
            : scene_type === "scheme"
              ? "Схемы"
              : scene_type === "gallery"
                ? "Галерея"
                : "Общие",
      urls,
      scene_type,
    })
  }
  return out
}

export type DimensionMigrateResult = {
  meta: Record<string, unknown>
  changed: boolean
}

export function migrateProductDimensionMetadata(
  product: Record<string, unknown>,
  allUrls: string[]
): DimensionMigrateResult {
  const meta = { ...(product.metadata as Record<string, unknown> | undefined) } as Record<
    string,
    unknown
  >
  const before = JSON.stringify(meta)

  const handleLower =
    typeof product.handle === "string" ? product.handle.toLowerCase() : ""
  const provencePaintWoodLocked =
    handleLower.startsWith("pv-") &&
    (meta.finish_metadata_source === "provence_paint_wood_split" ||
      hasProvencePaintWoodFinishMetadata(meta)) &&
    hasProvencePaintWoodDualFinishEvidence(allUrls, handleLower) &&
    !isProvenceFalsePaintWoodSplitMetadata(meta, allUrls, handleLower)
  if (provencePaintWoodLocked) {
    const paintLocked = asExecutions(meta.finish_color_executions)
    if (paintLocked.length >= 2) {
      const paintWithHex = withSwatchHexArray(paintLocked)
      meta.paint_finish_executions = paintWithHex
      meta.paint_finish_labels = Object.fromEntries(paintWithHex.map((e) => [e.key, e.label]))
      meta.finish_color_executions = paintWithHex
      meta.finish_color_labels = meta.paint_finish_labels
    }
    meta.shared_scene_media = null
    meta.dimension_metadata_version = DIMENSION_METADATA_VERSION
    meta.execution_dimension_contract =
      "paint_finish|finish_color_executions|provence_paint_wood_split"
    return { meta, changed: JSON.stringify(meta) !== before }
  }

  const beforeMigrate = JSON.stringify(meta)

  const paintRaw = asExecutions(meta.paint_finish_executions ?? meta.finish_color_executions)
  const fabricRaw = asExecutions(
    meta.fabric_upholstery_executions ?? meta.upholstery_color_executions
  )
  const headboard = asExecutions(meta.headboard_model_executions)
  const construction = asExecutions(
    meta.construction_tier_executions ?? meta.material_tier_executions
  )
  const frameRaw = asExecutions(meta.frame_material_executions)

  const { paint, fabric: fabricFromPaint } = splitPaintAndFabric(paintRaw, product)
  const fabricMerged = [...fabricRaw]
  for (const f of fabricFromPaint) {
    if (!fabricMerged.some((x) => x.key === f.key)) fabricMerged.push(f)
  }

  if (paint.length >= 2) {
    const paintWithHex = withSwatchHexArray(paint)
    meta.paint_finish_executions = paintWithHex
    meta.paint_finish_labels = Object.fromEntries(paintWithHex.map((e) => [e.key, e.label]))
    meta.finish_color_executions = paintWithHex
    meta.finish_color_labels = meta.paint_finish_labels
  }

  if (fabricMerged.length >= 2) {
    const fabricWithHex = withSwatchHexArray(fabricMerged)
    meta.fabric_upholstery_executions = fabricWithHex
    meta.fabric_upholstery_labels = Object.fromEntries(fabricWithHex.map((e) => [e.key, e.label]))
    meta.upholstery_color_executions = fabricWithHex
    meta.upholstery_color_labels = meta.fabric_upholstery_labels
  }

  if (construction.length >= 2) {
    const constructionWithHex = withSwatchHexArray(construction)
    meta.construction_tier_executions = constructionWithHex
    meta.material_tier_executions = constructionWithHex
    meta.material_tier_labels = Object.fromEntries(
      constructionWithHex.map((e) => [e.key, e.label])
    )
  }

  if (frameRaw.length >= 2) {
    const frameWithHex = withSwatchHexArray(frameRaw)
    meta.frame_material_executions = frameWithHex
    meta.frame_material_labels = Object.fromEntries(frameWithHex.map((e) => [e.key, e.label]))
  }

  if (headboard.length >= 2 && fabricMerged.length >= 2) {
    const matrix = buildBedExecutionMatrix(headboard, fabricMerged)
    if (matrix.length > 0) meta.bed_execution_matrix = matrix
  }

  const assigned = new Set<string>()
  for (const g of [...paint, ...fabricMerged, ...headboard, ...construction, ...frameRaw]) {
    for (const u of g.urls) assigned.add(normalizeMetadataUrlKey(u))
  }

  const shared = buildSharedSceneMedia(allUrls, assigned)
  if (shared.length > 0) {
    meta.shared_scene_media = shared
  } else {
    // Medusa metadata merge ignores `delete`; null clears the key.
    meta.shared_scene_media = null
  }

  meta.dimension_metadata_version = DIMENSION_METADATA_VERSION
  meta.execution_dimension_contract =
    "paint_finish|frame_material|fabric_upholstery|headboard_model|construction_tier|shared_scene"

  const handle = typeof product.handle === "string" ? product.handle : undefined
  if (reconcileOliverFabricFinishMetadata(meta, handle)) {
    return { meta, changed: true }
  }

  return { meta, changed: JSON.stringify(meta) !== beforeMigrate }
}

export function extractFrameMaterialFromUrls(urls: string[]): ExecutionGroup[] {
  const buckets = new Map<string, string[]>()
  for (const url of urls) {
    const hay = (url.split("/").pop() ?? url).toLowerCase()
    for (const wood of FRAME_WOOD_KEYS) {
      if (new RegExp(`[-_]${wood}(?:[-_.]|$)`).test(hay)) {
        const arr = buckets.get(wood) ?? []
        arr.push(url)
        buckets.set(wood, arr)
      }
    }
  }
  if (buckets.size < 2) return []
  return [...buckets.entries()].map(([key, urls]) => ({
    key,
    label: labelForDimensionKey(key),
    urls,
    swatch_hex: fallbackHexForToken(key),
  }))
}
