/**
 * Greenwich paint SKU: frame material (natural/dark wood) × paint finish matrix.
 * Legacy import flattened both woods into each `paint_finish_executions` color bucket.
 */
import { fallbackHexForToken, withSwatchHexArray } from "./dimension-swatch-hex"

export type GreenwichPaintMatrixEntry = {
  frame_material: "natural" | "dark"
  paint_finish: string
  label: string
  urls: string[]
}

export type GreenwichPaintDimensionBundle = {
  frame_material_executions: Array<{
    key: string
    label: string
    urls: string[]
    swatch_hex?: string
  }>
  paint_finish_executions: Array<{
    key: string
    label: string
    urls: string[]
    swatch_hex?: string
  }>
  greenwich_paint_execution_matrix: GreenwichPaintMatrixEntry[]
  frame_material_labels: Record<string, string>
  paint_finish_labels: Record<string, string>
}

const FRAME_LABELS: Record<string, string> = {
  natural: "Светлое дерево",
  dark: "Тёмное дерево",
}

const FRAME_SWATCH_HEX = {
  natural: fallbackHexForToken("natural"),
  dark: fallbackHexForToken("dark"),
} as const

export function isGreenwichPaintProductHandle(handle: string | undefined): boolean {
  if (!handle) return false
  const h = handle.toLowerCase()
  return /^greenwich-gr-\d{2}-\d/.test(h) || /^gr-\d{2}-\d/.test(h)
}

/** True when filename is dark-wood Greenwich paint asset (not paint color token `darkblue`). */
export function isGreenwichDarkWoodAssetUrl(url: string): boolean {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  if (!/greenwich|gr-\d{2}-\d/i.test(hay)) return false
  // `greenwich_dark_darkblue` / `greenwich_dark_grey-blue` — dark frame prefix.
  // Must NOT match paint token `greenwich_darkblue` (син-серый N436 on natural wood).
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

const GREENWICH_PAINT_TOKEN_RE =
  /greenwich[_-](grey-blue|darkblue|white|cacao|powder|cream|terracote|graphite|green|olive|capuchino|grey)(?:\d{2}|07|08|09|04|05|06|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)(?:[_\-.]|$)/i

/** Paint finish key from Greenwich asset filename (natural or dark-wood variant). */
export function greenwichPaintFinishTokenFromUrl(url: string): string | null {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  if (!/greenwich|gr-\d{2}-\d/i.test(hay)) return null
  const darkCompound = hay.match(
    /greenwich[_-]dark[_-](grey-blue|darkblue|white|cacao|powder|cream|terracote|graphite|green|olive|capuchino|grey)(?:\d{2}|[_\-.])/i
  )
  if (darkCompound?.[1]) return darkCompound[1].toLowerCase()
  const numbered = hay.match(GREENWICH_PAINT_TOKEN_RE)
  if (numbered?.[1]) return numbered[1].toLowerCase()
  const legacy07 = hay.match(/greenwich[_-]([a-z0-9-]+?)07(?:[_-]|\.)/i)
  if (legacy07?.[1]) {
    const raw = legacy07[1].toLowerCase()
    if (raw.startsWith("dark_")) return raw.slice(5)
    return raw
  }
  if (/\d{4}-\d{2}-\d{2}/.test(hay)) return null
  return null
}

function dedupeUrls(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const url of urls) {
    const base = (url.split("/").pop() ?? url).toLowerCase()
    if (seen.has(base)) continue
    seen.add(base)
    out.push(url)
  }
  return out
}

export function buildGreenwichPaintMatrixFromImageUrls(
  imageUrls: string[],
  paintLabels: Record<string, string>
): GreenwichPaintMatrixEntry[] {
  const buckets = new Map<string, { natural: string[]; dark: string[] }>()
  for (const url of dedupeUrls(imageUrls)) {
    const token = greenwichPaintFinishTokenFromUrl(url)
    if (!token) continue
    if (!buckets.has(token)) buckets.set(token, { natural: [], dark: [] })
    const slot = buckets.get(token)!
    if (isGreenwichDarkWoodAssetUrl(url)) slot.dark.push(url)
    else slot.natural.push(url)
  }
  const matrix: GreenwichPaintMatrixEntry[] = []
  for (const [paint_finish, slot] of buckets) {
    const label = paintLabels[paint_finish] ?? paint_finish
    if (slot.natural.length > 0) {
      matrix.push({
        frame_material: "natural",
        paint_finish,
        label,
        urls: slot.natural,
      })
    }
    if (slot.dark.length > 0) {
      matrix.push({
        frame_material: "dark",
        paint_finish,
        label,
        urls: slot.dark,
      })
    }
  }
  return matrix
}

export function greenwichMatrixNeedsRepair(
  matrix: GreenwichPaintMatrixEntry[],
  imageUrls: string[],
  paintLabels: Record<string, string>
): boolean {
  const expected = buildGreenwichPaintMatrixFromImageUrls(imageUrls, paintLabels)
  const paintsWithDualWood = new Set<string>()
  for (const cell of expected) {
    const frames = expected
      .filter((m) => m.paint_finish === cell.paint_finish)
      .map((m) => m.frame_material)
    if (new Set(frames).size > 1) paintsWithDualWood.add(cell.paint_finish)
  }
  for (const paint of paintsWithDualWood) {
    const expectedFrames = new Set(
      expected.filter((m) => m.paint_finish === paint).map((m) => m.frame_material)
    )
    const actualFrames = new Set(
      matrix.filter((m) => m.paint_finish === paint).map((m) => m.frame_material)
    )
    if (expectedFrames.size !== actualFrames.size) return true
    for (const f of expectedFrames) {
      if (!actualFrames.has(f)) return true
    }
  }
  return false
}

function matrixSignature(matrix: GreenwichPaintMatrixEntry[]): string {
  return JSON.stringify(
    [...matrix]
      .sort((a, b) =>
        `${a.paint_finish}\u0000${a.frame_material}`.localeCompare(
          `${b.paint_finish}\u0000${b.frame_material}`
        )
      )
      .map((m) => ({
        paint_finish: m.paint_finish,
        frame_material: m.frame_material,
        urls: m.urls.map((u) => (u.split("/").pop() ?? u).toLowerCase()),
      }))
  )
}

function applyGreenwichPaintDimensionBundleToMeta(
  meta: Record<string, unknown>,
  bundle: GreenwichPaintDimensionBundle
): void {
  meta.frame_material_executions = bundle.frame_material_executions
  meta.frame_material_labels = bundle.frame_material_labels
  meta.paint_finish_executions = bundle.paint_finish_executions
  meta.paint_finish_labels = bundle.paint_finish_labels
  meta.finish_color_executions = bundle.paint_finish_executions
  meta.finish_color_labels = bundle.paint_finish_labels
  meta.greenwich_paint_execution_matrix = bundle.greenwich_paint_execution_matrix
  meta.execution_dimension_contract =
    "paint_finish|frame_material|greenwich_paint_execution_matrix|shared_scene"
}

export function buildGreenwichPaintDimensionBundleFromMatrix(
  matrix: GreenwichPaintMatrixEntry[],
  paintMeta: Array<{ key: string; label: string; urls?: string[]; swatch_hex?: string }>
): GreenwichPaintDimensionBundle | null {
  if (matrix.length === 0) return null
  const frameKeys = new Set(matrix.map((m) => m.frame_material))
  if (frameKeys.size < 2) return null

  const paintLabels = Object.fromEntries(
    paintMeta.map((e) => [e.key, e.label?.trim() || e.key])
  )
  const hexByKey = Object.fromEntries(
    paintMeta.map((e) => [e.key, e.swatch_hex])
  )

  const frame_material_executions = (["natural", "dark"] as const)
    .filter((key) => frameKeys.has(key))
    .map((key) => ({
      key,
      label: FRAME_LABELS[key]!,
      urls: [] as string[],
      swatch_hex: FRAME_SWATCH_HEX[key],
    }))

  const paintKeys = [...new Set(matrix.map((m) => m.paint_finish))]
  const paint_finish_executions = withSwatchHexArray(
    paintKeys.map((key) => {
      const naturalHero =
        matrix.find((m) => m.frame_material === "natural" && m.paint_finish === key)
          ?.urls[0] ??
        matrix.find((m) => m.paint_finish === key)?.urls[0] ??
        ""
      return {
        key,
        label: paintLabels[key] ?? key,
        urls: naturalHero ? [naturalHero] : [],
        swatch_hex: hexByKey[key],
      }
    })
  )

  return {
    frame_material_executions,
    paint_finish_executions,
    greenwich_paint_execution_matrix: matrix,
    frame_material_labels: FRAME_LABELS,
    paint_finish_labels: paintLabels,
  }
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

export function buildGreenwichPaintDimensionBundle(
  executions: Array<{ key: string; label: string; urls: string[] }>
): GreenwichPaintDimensionBundle | null {
  const matrix = buildGreenwichPaintMatrixFromExecutions(executions)
  if (matrix.length === 0) return null

  const frameKeys = new Set(matrix.map((m) => m.frame_material))
  if (frameKeys.size < 2) return null

  const paintLabels = Object.fromEntries(
    executions.map((e) => [e.key, e.label?.trim() || e.key])
  )

  const frame_material_executions = (["natural", "dark"] as const)
    .filter((key) => frameKeys.has(key))
    .map((key) => ({
      key,
      label: FRAME_LABELS[key]!,
      urls: [] as string[],
      swatch_hex: FRAME_SWATCH_HEX[key],
    }))

  const paint_finish_executions = withSwatchHexArray(
    executions.map((ex) => {
      const naturalHero =
        matrix.find((m) => m.frame_material === "natural" && m.paint_finish === ex.key)
          ?.urls[0] ??
        matrix.find((m) => m.paint_finish === ex.key)?.urls[0] ??
        ""
      return {
        key: ex.key,
        label: ex.label,
        urls: naturalHero ? [naturalHero] : [],
      }
    })
  )

  return {
    frame_material_executions,
    paint_finish_executions,
    greenwich_paint_execution_matrix: matrix,
    frame_material_labels: FRAME_LABELS,
    paint_finish_labels: paintLabels,
  }
}

/** Rebuild paint×wood matrix from product `images[]` (source of truth after hero-only buckets). */
export function applyGreenwichPaintDimensionFromImages(
  meta: Record<string, unknown>,
  imageUrls: string[],
  handle: string
): boolean {
  if (!isGreenwichPaintProductHandle(handle)) return false

  const paintRaw = meta.paint_finish_executions ?? meta.finish_color_executions
  if (!Array.isArray(paintRaw) || paintRaw.length < 2) return false

  const paintMeta = paintRaw as Array<{
    key: string
    label: string
    urls?: string[]
    swatch_hex?: string
  }>
  const paintLabels = Object.fromEntries(
    paintMeta.map((e) => [e.key, e.label?.trim() || e.key])
  )
  const matrix = buildGreenwichPaintMatrixFromImageUrls(imageUrls, paintLabels)
  const bundle = buildGreenwichPaintDimensionBundleFromMatrix(matrix, paintMeta)
  if (!bundle) return false

  const existing = meta.greenwich_paint_execution_matrix
  const existingMatrix = Array.isArray(existing)
    ? (existing as GreenwichPaintMatrixEntry[])
    : []
  if (
    existingMatrix.length > 0 &&
    matrixSignature(existingMatrix) === matrixSignature(bundle.greenwich_paint_execution_matrix)
  ) {
    return false
  }

  applyGreenwichPaintDimensionBundleToMeta(meta, bundle)
  return true
}

/** Apply paint×wood split onto product metadata; returns true when changed. */
export function applyGreenwichPaintDimensionToMeta(
  meta: Record<string, unknown>,
  handle: string,
  opts?: { imageUrls?: string[]; forceRepair?: boolean }
): boolean {
  if (!isGreenwichPaintProductHandle(handle)) return false

  const imageUrls = opts?.imageUrls ?? []
  if (imageUrls.length > 0) {
    const paintRaw = meta.paint_finish_executions ?? meta.finish_color_executions
    const paintMeta = Array.isArray(paintRaw)
      ? (paintRaw as Array<{ key: string; label: string }>)
      : []
    const paintLabels = Object.fromEntries(
      paintMeta.map((e) => [e.key, e.label?.trim() || e.key])
    )
    const existing = meta.greenwich_paint_execution_matrix
    const existingMatrix = Array.isArray(existing)
      ? (existing as GreenwichPaintMatrixEntry[])
      : []
    const needsRepair =
      opts?.forceRepair === true ||
      (existingMatrix.length > 0 &&
        greenwichMatrixNeedsRepair(existingMatrix, imageUrls, paintLabels))
    if (existingMatrix.length === 0 || needsRepair) {
      if (applyGreenwichPaintDimensionFromImages(meta, imageUrls, handle)) return true
    }
  }

  const raw = meta.paint_finish_executions ?? meta.finish_color_executions
  if (!Array.isArray(raw) || raw.length < 2) return false

  const executions = raw as Array<{ key: string; label: string; urls: string[] }>
  const hasDualWoodInSource = executions.some((ex) => {
    const urls = ex.urls ?? []
    const hasDark = urls.some((u) => isGreenwichDarkWoodAssetUrl(u))
    const hasNatural = urls.some((u) => !isGreenwichDarkWoodAssetUrl(u))
    return hasDark && hasNatural
  })
  const hasDualWoodAcrossSource =
    executions.some((ex) => (ex.urls ?? []).some((u) => isGreenwichDarkWoodAssetUrl(u))) &&
    executions.some((ex) => (ex.urls ?? []).some((u) => !isGreenwichDarkWoodAssetUrl(u)))

  const existing = meta.greenwich_paint_execution_matrix
  if (
    !opts?.forceRepair &&
    !hasDualWoodInSource &&
    !hasDualWoodAcrossSource &&
    Array.isArray(existing) &&
    existing.length > 0
  ) {
    const frames = new Set(
      existing.map((e) =>
        e && typeof e === "object" && (e as { frame_material?: string }).frame_material
          ? (e as { frame_material: string }).frame_material
          : ""
      )
    )
    if (frames.has("natural") && frames.has("dark")) {
      return false
    }
  }

  if (!hasDualWoodInSource && !hasDualWoodAcrossSource && imageUrls.length === 0) return false

  const bundle = buildGreenwichPaintDimensionBundle(executions)
  if (!bundle) return false

  applyGreenwichPaintDimensionBundleToMeta(meta, bundle)
  return true
}
