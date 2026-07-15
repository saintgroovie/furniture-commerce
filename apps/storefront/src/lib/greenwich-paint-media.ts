/**
 * Greenwich paint SKU: wood (natural/dark) × paint color matrix for card / PDP.
 */
import type { CardColorVariant } from "./card-color-media"
import { buyerFacingWoodToneLabel } from "./buyer-wood-label"
import { resolveStorefrontProductImageSrc } from "./product-images"
import { fallbackHexForToken } from "./swatch-fallback-colors"

export type GreenwichPaintMatrixEntry = {
  frame_material: "natural" | "dark"
  paint_finish: string
  label: string
  urls: string[]
}

export function isGreenwichPaintProductHandle(handle: string | undefined): boolean {
  if (!handle) return false
  const h = handle.toLowerCase()
  return /^greenwich-gr-\d{2}-\d/.test(h) || /^gr-\d{2}-\d/.test(h)
}

/** True when filename is dark-wood Greenwich paint asset (not paint color token). */
export function isGreenwichDarkWoodAssetUrl(url: string): boolean {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  if (!/greenwich|gr-\d{2}-\d/i.test(hay)) return false
  if (/greenwich[_-]dark_/i.test(hay)) return true
  if (
    /[_-]dark[_-](grey-blue|darkblue|white|cacao|powder|cream|terracote|graphite|green|olive|capuchino|grey)/i.test(
      hay
    )
  ) {
    return true
  }
  return false
}

export function buildGreenwichPaintMatrixFromExecutions(
  executions: Array<{ key: string; label: string; urls: string[] }>
): GreenwichPaintMatrixEntry[] {
  const matrix: GreenwichPaintMatrixEntry[] = []
  for (const ex of executions) {
    const naturalUrls: string[] = []
    const darkUrls: string[] = []
    for (const url of ex.urls ?? []) {
      if (isGreenwichDarkWoodAssetUrl(url)) darkUrls.push(url)
      else naturalUrls.push(url)
    }
    if (naturalUrls.length > 0) {
      matrix.push({
        frame_material: "natural",
        paint_finish: ex.key,
        label: ex.label,
        urls: naturalUrls,
      })
    }
    if (darkUrls.length > 0) {
      matrix.push({
        frame_material: "dark",
        paint_finish: ex.key,
        label: ex.label,
        urls: darkUrls,
      })
    }
  }
  return matrix
}

export function isGreenwichPaintProduct(product: Record<string, unknown>): boolean {
  const handle = typeof product.handle === "string" ? product.handle : ""
  if (!isGreenwichPaintProductHandle(handle)) return false
  if (isGreenwichBedProduct(product)) return false
  return greenwichPaintMatrixFromProduct(product).length > 0
}

function isGreenwichBedProduct(product: Record<string, unknown>): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  return meta?.display_group === "greenwich-bed"
}

export function greenwichPaintMatrixFromProduct(
  product: Record<string, unknown>
): GreenwichPaintMatrixEntry[] {
  const meta = product.metadata as Record<string, unknown> | undefined
  const raw = meta?.greenwich_paint_execution_matrix
  if (Array.isArray(raw) && raw.length > 0) {
    const out: GreenwichPaintMatrixEntry[] = []
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue
      const o = entry as Record<string, unknown>
      const frame_material = o.frame_material === "dark" ? "dark" : "natural"
      const paint_finish = typeof o.paint_finish === "string" ? o.paint_finish : ""
      const label = typeof o.label === "string" ? o.label : paint_finish
      const urls = Array.isArray(o.urls)
        ? o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        : []
      if (!paint_finish || urls.length === 0) continue
      out.push({ frame_material, paint_finish, label, urls })
    }
    if (out.length > 0) return out
  }

  const paintRaw = meta?.paint_finish_executions ?? meta?.finish_color_executions
  if (!Array.isArray(paintRaw) || paintRaw.length < 2) return []
  const executions = paintRaw as Array<{ key: string; label: string; urls: string[] }>
  const hasDark = executions.some((e) =>
    (e.urls ?? []).some((u) => isGreenwichDarkWoodAssetUrl(u))
  )
  const hasNatural = executions.some((e) =>
    (e.urls ?? []).some((u) => !isGreenwichDarkWoodAssetUrl(u))
  )
  if (!hasDark || !hasNatural) return []
  return buildGreenwichPaintMatrixFromExecutions(executions)
}

export function resolveGreenwichPaintMedia(
  matrix: GreenwichPaintMatrixEntry[],
  frameMaterial: string,
  paintFinish: string
): { mainSrc: string; extraSrcs: string[] } | null {
  const entry = matrix.find(
    (m) => m.frame_material === frameMaterial && m.paint_finish === paintFinish
  )
  if (!entry || entry.urls.length === 0) return null
  const resolved = entry.urls.map((u) => resolveStorefrontProductImageSrc(u))
  return { mainSrc: resolved[0]!, extraSrcs: resolved.slice(1) }
}

export function defaultGreenwichPaintSelection(matrix: GreenwichPaintMatrixEntry[]): {
  paintFinish: string
  frameMaterial: string
} {
  const paints = availablePaintKeys(matrix)
  const paintFinish = paints.includes("white") ? "white" : paints[0] ?? "white"
  const frames = availableFrameKeysForPaint(matrix, paintFinish)
  const frameMaterial = frames.includes("natural") ? "natural" : frames[0] ?? "natural"
  return { paintFinish, frameMaterial }
}

export function availablePaintKeys(matrix: GreenwichPaintMatrixEntry[]): string[] {
  const keys = new Set<string>()
  for (const m of matrix) keys.add(m.paint_finish)
  return [...keys]
}

export function availableFrameKeysForPaint(
  matrix: GreenwichPaintMatrixEntry[],
  paintFinish: string
): string[] {
  const keys = new Set<string>()
  for (const m of matrix) {
    if (m.paint_finish === paintFinish) keys.add(m.frame_material)
  }
  return [...keys]
}

export function availablePaintKeysForFrame(
  matrix: GreenwichPaintMatrixEntry[],
  frameMaterial: string
): string[] {
  const keys = new Set<string>()
  for (const m of matrix) {
    if (m.frame_material === frameMaterial) keys.add(m.paint_finish)
  }
  return [...keys]
}

/** Color-first: keep paint, coerce frame to a cell that exists for this paint. */
export function coerceGreenwichPaintSelection(
  matrix: GreenwichPaintMatrixEntry[],
  paintFinish: string,
  frameMaterial: string | null | undefined
): { paintFinish: string; frameMaterial: string } {
  const frames = availableFrameKeysForPaint(matrix, paintFinish)
  const frame =
    frameMaterial && frames.includes(frameMaterial)
      ? frameMaterial
      : frames.includes("natural")
        ? "natural"
        : frames[0] ?? frameMaterial ?? "natural"
  return { paintFinish, frameMaterial: frame }
}

export function buildGreenwichPaintFinishVariants(
  matrix: GreenwichPaintMatrixEntry[],
  paintMeta?: Array<{ key: string; label: string; swatch_hex?: string }>
): CardColorVariant[] {
  const labelByKey = new Map(
    (paintMeta ?? []).map((e) => [e.key, e.label?.trim() || e.key])
  )
  const hexByKey = new Map(
    (paintMeta ?? []).map((e) => [e.key, e.swatch_hex ?? null])
  )
  const variants: CardColorVariant[] = []
  for (const paintKey of availablePaintKeys(matrix)) {
    const cell =
      matrix.find((m) => m.paint_finish === paintKey && m.frame_material === "natural") ??
      matrix.find((m) => m.paint_finish === paintKey)
    if (!cell || cell.urls.length === 0) continue
    const resolved = cell.urls.map((u) => resolveStorefrontProductImageSrc(u))
    variants.push({
      key: paintKey,
      label: labelByKey.get(paintKey) ?? cell.label ?? paintKey,
      mainSrc: resolved[0] ?? "",
      extraSrcs: resolved.slice(1),
      swatchToken: paintKey,
      swatchHex: hexByKey.get(paintKey) ?? null,
    })
  }
  return variants.length > 1 ? variants : []
}

export function buildGreenwichPaintWoodVariants(
  matrix: GreenwichPaintMatrixEntry[],
  frameMeta?: Array<{ key: string; label: string; swatch_hex?: string }>,
  paintFinish?: string | null
): CardColorVariant[] | undefined {
  const labelByKey = new Map(
    (frameMeta ?? []).map((e) => [e.key, e.label?.trim() || e.key])
  )
  const hexByKey = new Map(
    (frameMeta ?? []).map((e) => [e.key, e.swatch_hex ?? null])
  )
  const frames = ["natural", "dark"].filter((f) =>
    matrix.some(
      (m) =>
        m.frame_material === f &&
        (!paintFinish || m.paint_finish === paintFinish)
    )
  )
  if (frames.length < 2) return undefined
  return frames.map((key) => {
    const rawLabel =
      labelByKey.get(key) ??
      (key === "natural" ? "Светлое дерево" : "Тёмное дерево")
    return {
      key,
      label: buyerFacingWoodToneLabel(rawLabel, key),
      mainSrc: "",
      extraSrcs: [],
      swatchToken: key,
      swatchSampleRegion: "frame_wood" as const,
      swatchHex: hexByKey.get(key) ?? fallbackHexForToken(key === "dark" ? "dark" : "natural"),
    }
  })
}
