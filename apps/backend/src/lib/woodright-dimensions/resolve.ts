import {
  hasAnyDimension,
  readDimensionAxisBag,
  readStructuredDimensionsMm,
  toPresenterDimensions,
  toSnapshotDimensions,
} from "./normalize"
import {
  AXIS_TO_MM_KEY,
  DIMENSION_AXIS_ORDER,
  type DimensionAxis,
  type DimensionAxisState,
  type DimensionProvenance,
  type DimensionSourceLayer,
  type ResolveDimensionsResult,
  type ResolvedDimensionsMm,
} from "./types"

export type DimensionEntityLike = {
  metadata?: Record<string, unknown> | null
  // Medusa shipping fields - NOT furniture SoT; ignored by default.
  height?: unknown
  width?: unknown
  length?: unknown
}

function metaBag(entity: DimensionEntityLike | null | undefined): {
  mm: ResolvedDimensionsMm
  states: DimensionAxisState[]
  blocked: DimensionAxis[]
} {
  const m = (entity?.metadata ?? {}) as Record<string, unknown>
  const primaryMm = readStructuredDimensionsMm(m.dimensions)
  const primary = readDimensionAxisBag(m.dimensions)
  if (hasAnyDimension(primaryMm) || primary.states.length > 0 || primary.blocked.length > 0) {
    return { mm: primaryMm, states: primary.states, blocked: primary.blocked }
  }
  const fallback = readDimensionAxisBag(m.dimensions_normalized)
  return {
    mm: readStructuredDimensionsMm(m.dimensions_normalized),
    states: fallback.states,
    blocked: fallback.blocked,
  }
}

/**
 * Variant-first, per-axis product fallback.
 *
 * Precedence per axis:
 * 1. selected variant structured metadata dimensions
 * 2. product structured metadata dimensions
 * 3. null
 *
 * Does not invent values. Does not use Medusa variant.height/width/length
 * (no project evidence that length === depth).
 */
export function resolveFurnitureDimensions(input: {
  product?: DimensionEntityLike | null
  variant?: DimensionEntityLike | null
}): ResolveDimensionsResult {
  const variantBag = metaBag(input.variant)
  const productBag = metaBag(input.product)

  const mm: ResolvedDimensionsMm = {
    height_mm: null,
    width_mm: null,
    depth_mm: null,
  }
  const provenance = {
    height: "none",
    width: "none",
    depth: "none",
  } as DimensionProvenance
  const axis_states: DimensionAxisState[] = []

  for (const axis of DIMENSION_AXIS_ORDER) {
    const key = AXIS_TO_MM_KEY[axis]
    const variantState = variantBag.states.find((state) => state.axis === axis)
    const fromVariant = variantBag.mm[key]
    if (variantState) {
      axis_states.push(variantState)
      provenance[axis] = "variant"
      mm[key] = null
      continue
    }
    if (variantBag.blocked.includes(axis)) {
      mm[key] = null
      provenance[axis] = "none"
      continue
    }
    if (fromVariant != null) {
      mm[key] = fromVariant
      provenance[axis] = "variant"
      continue
    }
    const productState = productBag.states.find((state) => state.axis === axis)
    if (productState) {
      axis_states.push(productState)
      provenance[axis] = "product"
      mm[key] = null
      continue
    }
    if (productBag.blocked.includes(axis)) {
      mm[key] = null
      provenance[axis] = "none"
      continue
    }
    const fromProduct = productBag.mm[key]
    if (fromProduct != null) {
      mm[key] = fromProduct
      provenance[axis] = "product"
      continue
    }
    mm[key] = null
    provenance[axis] = "none"
  }

  return {
    mm,
    provenance,
    axis_states,
    has_any: hasAnyDimension(mm) || axis_states.length > 0,
  }
}

export function resolvePresenterDimensions(input: {
  product?: DimensionEntityLike | null
  variant?: DimensionEntityLike | null
}) {
  return toPresenterDimensions(resolveFurnitureDimensions(input).mm)
}

export function resolveSnapshotDimensions(input: {
  product?: DimensionEntityLike | null
  variant?: DimensionEntityLike | null
}) {
  return toSnapshotDimensions(resolveFurnitureDimensions(input).mm)
}

/** Ordered known axes for UI (height → width → depth). */
export function orderedKnownAxes(
  mm: ResolvedDimensionsMm
): Array<{ axis: DimensionAxis; mm: number; source: DimensionSourceLayer }> {
  const resolved = resolveFurnitureDimensions({
    product: {
      metadata: {
        dimensions: {
          height_mm: mm.height_mm,
          width_mm: mm.width_mm,
          depth_mm: mm.depth_mm,
        },
      },
    },
  })
  // Prefer direct read of provided mm bag without re-source.
  const out: Array<{
    axis: DimensionAxis
    mm: number
    source: DimensionSourceLayer
  }> = []
  for (const axis of DIMENSION_AXIS_ORDER) {
    const key = AXIS_TO_MM_KEY[axis]
    const value = mm[key]
    if (value != null) {
      out.push({ axis, mm: value, source: resolved.provenance[axis] })
    }
  }
  return out
}
