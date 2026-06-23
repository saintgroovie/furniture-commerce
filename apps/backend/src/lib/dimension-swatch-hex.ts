/**
 * Authoritative swatch fills for dimension execution metadata.
 * Shared by apply scripts and gallery dimension migration.
 */

export const SWATCH_FALLBACK_HEX: Record<string, string> = {
  neutral: "#e8e4df",
  blue: "#b8c9d8",
  grey: "#a8a399",
  gray: "#a8a399",
  cream: "#ece4d6",
  milk: "#ebe4d8",
  olive: "#848872",
  green: "#6d7a64",
  white: "#f2ede6",
  beige: "#d6cfc2",
  black: "#2e2924",
  brown: "#6f5642",
  graphite: "#4a4d4a",
  ivory: "#f0ebe2",
  dark: "#3a4038",
  darkblue: "#4d6b72",
  "grey-blue": "#8fa4ae",
  cacao: "#6f5642",
  capuchino: "#b79b7d",
  powder: "#d8b7b3",
  terracote: "#b8664a",
  oak: "#c4a882",
  walnut: "#6b4c35",
  wenge: "#3d2b24",
  natural: "#d6cfc2",
  velvet: "#6e6278",
  linen: "#d8d0c4",
  lillian: "#d8d0c4",
  lorna: "#b9aea5",
  leona: "#b8c9d8",
  linda: "#c9b7a6",
  torno: "#7a6e66",
  natural_beige: "#d6cfc2",
  dark_beige: "#b8b0a4",
  natural_darkblue: "#4d6b72",
  dark_darkblue: "#3a5560",
  solid_full: "#c4a882",
  solid_front_ldsp_body: "#d8d0c4",
}

export type SwatchExecution = {
  key: string
  label: string
  urls: string[]
  swatch_hex?: string
}

export function fallbackHexForToken(token: string | null | undefined): string {
  if (!token) return SWATCH_FALLBACK_HEX.neutral!
  const k = token.toLowerCase()
  return SWATCH_FALLBACK_HEX[k] ?? SWATCH_FALLBACK_HEX.neutral!
}

export function withSwatchHex<T extends { key?: string; swatch_hex?: unknown }>(
  entry: T
): T & { swatch_hex: string } {
  if (typeof entry.swatch_hex === "string" && entry.swatch_hex.trim()) {
    return { ...entry, swatch_hex: entry.swatch_hex.trim() } as T & { swatch_hex: string }
  }
  const key = typeof entry.key === "string" ? entry.key : null
  return { ...entry, swatch_hex: fallbackHexForToken(key) }
}

export function withSwatchHexArray<T extends { key?: string; swatch_hex?: unknown }>(
  rows: T[]
): Array<T & { swatch_hex: string }> {
  return rows.map(withSwatchHex)
}

/** Metadata arrays that drive card/PDP color swatches. */
export const SWATCH_EXECUTION_METADATA_KEYS = [
  "paint_finish_executions",
  "finish_color_executions",
  "fabric_upholstery_executions",
  "upholstery_color_executions",
  "frame_material_executions",
  "construction_tier_executions",
  "material_tier_executions",
] as const

export type SwatchExecutionMetadataKey = (typeof SWATCH_EXECUTION_METADATA_KEYS)[number]

export function enrichExecutionRows(raw: unknown): {
  rows: SwatchExecution[]
  changed: boolean
} {
  if (!Array.isArray(raw)) return { rows: [], changed: false }
  const out: SwatchExecution[] = []
  let changed = false
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    const key = typeof o.key === "string" ? o.key : ""
    const label = typeof o.label === "string" ? o.label.trim() : ""
    const urls = Array.isArray(o.urls)
      ? o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : []
    if (!key) continue
    const enriched = withSwatchHex({
      key,
      label: label || key,
      urls,
      swatch_hex: o.swatch_hex,
    })
    const row = { ...o, ...enriched }
    if (o.swatch_hex !== enriched.swatch_hex) changed = true
    out.push(row as SwatchExecution)
  }
  return { rows: out, changed }
}

export function enrichProductSwatchMetadata(
  meta: Record<string, unknown>
): { meta: Record<string, unknown>; changed: boolean } {
  const next = { ...meta }
  let changed = false

  const enrichKey = (key: SwatchExecutionMetadataKey) => {
    const { rows, changed: keyChanged } = enrichExecutionRows(meta[key])
    if (rows.length === 0 || !keyChanged) return
    next[key] = rows
    changed = true
  }

  for (const key of SWATCH_EXECUTION_METADATA_KEYS) {
    enrichKey(key)
  }

  return { meta: next, changed }
}

const PUBLISHED_PRODUCT_PAGE_SIZE = 100

/** Paginate published products — avoids silent truncation at `take: 300`. */
export async function listPublishedProductsPaginated<T extends { id?: string }>(
  listProducts: (
    filters: Record<string, unknown>,
    config: { take: number; skip: number; relations?: string[] }
  ) => Promise<T[] | null | undefined>,
  filters: Record<string, unknown>,
  relations?: string[]
): Promise<T[]> {
  const out: T[] = []
  let skip = 0
  while (true) {
    const batch = (await listProducts(filters, {
      take: PUBLISHED_PRODUCT_PAGE_SIZE,
      skip,
      ...(relations ? { relations } : {}),
    })) ?? []
    if (batch.length === 0) break
    out.push(...batch)
    if (batch.length < PUBLISHED_PRODUCT_PAGE_SIZE) break
    skip += PUBLISHED_PRODUCT_PAGE_SIZE
  }
  return out
}
