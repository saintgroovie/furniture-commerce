/**
 * Woodright furniture dimensions - canonical axis contract.
 *
 * SoT for buyer габариты: metadata `dimensions` / `dimensions_normalized`
 * with keys height_mm / width_mm / depth_mm (millimetres).
 *
 * Medusa ProductVariant.height / .width / .length are shipping-style fields.
 * This repo does not treat them as furniture SoT and does NOT map
 * `length` → depth without explicit catalog evidence (none found in audit).
 *
 * Buyer order is always: height → width → depth (Высота → Ширина → Глубина).
 */

export type DimensionAxis = "height" | "width" | "depth"

export const DIMENSION_AXIS_ORDER: readonly DimensionAxis[] = [
  "height",
  "width",
  "depth",
] as const

export type DimensionMmKey = "height_mm" | "width_mm" | "depth_mm"

export const AXIS_TO_MM_KEY: Record<DimensionAxis, DimensionMmKey> = {
  height: "height_mm",
  width: "width_mm",
  depth: "depth_mm",
}

/** Clean axis values in mm. Missing axes are null (never 0). */
export type ResolvedDimensionsMm = {
  height_mm: number | null
  width_mm: number | null
  depth_mm: number | null
}

export type DimensionSourceLayer = "variant" | "product" | "none"

/** Internal diagnostics only - never expose in buyer Store DTO. */
export type DimensionProvenance = Record<DimensionAxis, DimensionSourceLayer>

/** One physical position of an axis. Not a point on a range. */
export type DimensionPosition = {
  value_mm: number
  label: string
}

/**
 * Discrete positions of one axis. Source order, not a min/max range.
 * Lives inside the same `dimensions` object as scalar axes.
 * `positions` binds each millimetre value to its own label.
 * `values_mm` plus `note` remains the unlabeled list.
 */
export type DimensionAxisState = {
  axis: DimensionAxis
  values_mm: number[]
  note: string | null
  positions: DimensionPosition[] | null
}

export type ResolveDimensionsResult = {
  mm: ResolvedDimensionsMm
  provenance: DimensionProvenance
  /** Axes whose size is a list of positions. Scalar mm for that axis is omitted. */
  axis_states: DimensionAxisState[]
  /** True when at least one axis is a positive finite mm or a state list. */
  has_any: boolean
}

/** Snapshot-safe payload: omit unknown axes; never store 0. */
export type DimensionsSnapshotV1 = {
  unit: "mm"
  height_mm?: number
  width_mm?: number
  depth_mm?: number
}

export const AXIS_OWNER_LABEL: Record<DimensionAxis, string> = {
  height: "Высота",
  width: "Ширина",
  depth: "Глубина",
}
