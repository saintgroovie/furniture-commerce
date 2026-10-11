/**
 * Sparse variant map for one product.
 *
 * Axes come from variant metadata written by catalog normalization.
 * A chip always points at an existing variant. A missing combination
 * is never invented and never becomes a selectable pair.
 */

export const VARIANT_CAPABILITY_KEYS = [
  "finish_color_executions",
  "paint_finish_executions",
  "fabric_upholstery_executions",
  "upholstery_color_executions",
  "frame_material_executions",
  "headboard_model_executions",
  "material_tiers",
  "pedestal_filling",
  "finish_color_labels",
  "paint_finish_labels",
  "fabric_upholstery_labels",
] as const

export type SparseAxisValue = {
  label: string
  display: string
  sort: number
}

export type SparseVariant = {
  id: string
  sku: string
  values: Record<string, SparseAxisValue>
}

export type SparseVariantMap = {
  axes: { key: string; label: string }[]
  variants: SparseVariant[]
}

export type SparseAxisChoice = {
  variantId: string
  sku: string
  label: string
  sort: number
  isCurrent: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function liveVariants(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = product.variants
  if (!Array.isArray(variants)) return []
  return variants.filter((item): item is Record<string, unknown> => {
    const variant = asRecord(item)
    return Boolean(variant && !variant.deleted_at && typeof variant.id === "string")
  })
}

function readAxes(variant: Record<string, unknown>): Record<string, SparseAxisValue> | null {
  const axes = asRecord(asRecord(variant.metadata)?.variant_axes)
  if (!axes) return null
  const values: Record<string, SparseAxisValue> = {}
  for (const [key, raw] of Object.entries(axes)) {
    const item = asRecord(raw)
    const display = typeof item?.display === "string" ? item.display.trim() : ""
    const label = typeof item?.label === "string" ? item.label.trim() : ""
    if (!display || !label) return null
    const sort = Number(item?.sort)
    values[key] = { label, display, sort: Number.isFinite(sort) ? sort : 0 }
  }
  return Object.keys(values).length ? values : null
}

/** Null when this product is not a sparse multi-variant model. */
export function sparseVariantMap(product: Record<string, unknown>): SparseVariantMap | null {
  const variants = liveVariants(product)
  if (variants.length < 2) return null
  const parsed: SparseVariant[] = []
  for (const variant of variants) {
    if (typeof variant.sku !== "string" || !variant.sku) return null
    const values = readAxes(variant)
    if (!values) return null
    parsed.push({ id: variant.id as string, sku: variant.sku, values })
  }
  const keys = Object.keys(parsed[0].values).sort()
  if (
    parsed.some((variant) => Object.keys(variant.values).sort().join("|") !== keys.join("|"))
  ) {
    return null
  }
  const signatures = new Set(
    parsed.map((variant) => keys.map((key) => variant.values[key].display).join("|"))
  )
  if (signatures.size !== parsed.length) return null
  return {
    axes: keys.map((key) => ({ key, label: parsed[0].values[key].label })),
    variants: parsed,
  }
}

export function orderedSparseVariants(map: SparseVariantMap): SparseVariant[] {
  return [...map.variants].sort((a, b) => {
    for (const axis of map.axes) {
      const delta = a.values[axis.key].sort - b.values[axis.key].sort
      if (delta) return delta
    }
    return a.sku.localeCompare(b.sku, "ru")
  })
}

export function resolveSparseVariantId(
  map: SparseVariantMap | null,
  requested: string | undefined
): string | null {
  if (!map) return null
  if (requested && map.variants.some((variant) => variant.id === requested)) return requested
  return orderedSparseVariants(map)[0]?.id ?? null
}

function sameOtherAxes(map: SparseVariantMap, left: SparseVariant, right: SparseVariant, axisKey: string) {
  return map.axes.every(
    (axis) => axis.key === axisKey || left.values[axis.key].display === right.values[axis.key].display
  )
}

/**
 * One row per axis that actually varies.
 * Each choice keeps every other axis. A value with no SKU for the current
 * combination is omitted, not snapped onto a different construction.
 */
export function sparseAxisChoices(
  map: SparseVariantMap,
  selectedId: string
): { key: string; label: string; choices: SparseAxisChoice[] }[] {
  const current = map.variants.find((variant) => variant.id === selectedId) ?? orderedSparseVariants(map)[0]
  if (!current) return []
  const rows = []
  for (const axis of map.axes) {
    const seen = new Map<string, SparseVariant>()
    const candidates = [...map.variants].sort(
      (a, b) => a.values[axis.key].sort - b.values[axis.key].sort || a.sku.localeCompare(b.sku, "ru")
    )
    for (const variant of candidates) {
      if (!sameOtherAxes(map, variant, current, axis.key)) continue
      const display = variant.values[axis.key].display
      if (!seen.has(display)) seen.set(display, variant)
    }
    if (seen.size < 2) continue
    rows.push({
      key: axis.key,
      label: axis.label,
      choices: [...seen.entries()].map(([display, variant]) => ({
        variantId: variant.id,
        sku: variant.sku,
        label: display,
        sort: variant.values[axis.key].sort,
        isCurrent: display === current.values[axis.key].display,
      })),
    })
  }
  return rows
}

/** Clone the product so execution selectors see only this variant's capabilities. */
export function withVariantCapabilities(
  product: Record<string, unknown>,
  variant: Record<string, unknown> | null
): Record<string, unknown> {
  if (!variant) return product
  const variantMeta = asRecord(variant.metadata)
  const capabilities = asRecord(variantMeta?.capabilities)
  if (!capabilities && !Array.isArray(variantMeta?.gallery_urls)) return product
  const metadata = { ...(asRecord(product.metadata) ?? {}) }
  if (capabilities) {
    for (const key of VARIANT_CAPABILITY_KEYS) {
      if (key in capabilities) metadata[key] = capabilities[key]
      else delete metadata[key]
    }
  }
  const next: Record<string, unknown> = { ...product, metadata }
  const gallery = variantMeta?.gallery_urls
  if (Array.isArray(gallery) && gallery.length > 0 && gallery.every((url) => typeof url === "string" && url)) {
    next.images = gallery.map((url) => ({ url }))
    next.thumbnail = gallery[0]
  }
  return next
}
