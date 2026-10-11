import type {
  DimensionAxis,
  DimensionAxisState,
  DimensionMmKey,
  DimensionPosition,
  ResolvedDimensionsMm,
} from "./types"

/**
 * Normalize a single axis value.
 * Rejects: null/undefined/"" / 0 / negative / NaN / Infinity / non-numeric strings.
 * Accepts: positive finite numbers; numeric strings like "900" or "900.0".
 * Units: values are treated as millimetres (project SoT). No silent cm→mm guess.
 */
export function normalizeDimensionMm(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return null
    // Reject unit-suffixed strings in production resolver (no silent parse).
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null
    const n = Number(t)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null
    return raw
  }
  return null
}

export function emptyResolvedDimensions(): ResolvedDimensionsMm {
  return { height_mm: null, width_mm: null, depth_mm: null }
}

/** Read structured mm bag; zeros become null. */
export function readStructuredDimensionsMm(
  raw: unknown
): ResolvedDimensionsMm {
  const out = emptyResolvedDimensions()
  if (!raw || typeof raw !== "object") return out
  const obj = raw as Record<string, unknown>
  const keys: DimensionMmKey[] = ["height_mm", "width_mm", "depth_mm"]
  for (const key of keys) {
    out[key] = normalizeDimensionMm(obj[key])
  }
  return out
}

/** Legacy snapshot reader: treat stored 0 as unknown. */
export function readLegacyDimensionsSnapshot(
  raw: unknown
): ResolvedDimensionsMm {
  return readStructuredDimensionsMm(raw)
}

const AXES: readonly DimensionAxis[] = ["height", "width", "depth"]

function isAxis(value: unknown): value is DimensionAxis {
  return value === "height" || value === "width" || value === "depth"
}

export type DimensionAxisBag = {
  states: DimensionAxisState[]
  /** Axes whose multi-position payload was present and invalid. Scalar must not fill these. */
  blocked: DimensionAxis[]
}

function readLabeledPositions(
  raw: unknown
): { kind: "absent" } | { kind: "blocked" } | { kind: "ok"; positions: DimensionPosition[] } {
  if (raw == null) return { kind: "absent" }
  if (!Array.isArray(raw) || raw.length < 2) return { kind: "blocked" }
  const positions: DimensionPosition[] = []
  const values = new Set<number>()
  const labels = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== "object") return { kind: "blocked" }
    const obj = item as Record<string, unknown>
    const mm = normalizeDimensionMm(obj.value_mm)
    const label = typeof obj.label === "string" ? obj.label.trim() : ""
    if (mm == null || !label || values.has(mm) || labels.has(label)) {
      return { kind: "blocked" }
    }
    values.add(mm)
    labels.add(label)
    positions.push({ value_mm: mm, label })
  }
  return { kind: "ok", positions }
}

/**
 * Read discrete axis positions from the same dimensions object as scalars.
 * Labeled `positions` win. An unlabeled list needs two or more distinct
 * positive millimetre values. Malformed labeled positions block that axis.
 * Order is kept. This is not a range.
 */
export function readDimensionAxisBag(raw: unknown): DimensionAxisBag {
  if (!raw || typeof raw !== "object") return { states: [], blocked: [] }
  const list = (raw as Record<string, unknown>).axis_states
  if (!Array.isArray(list)) return { states: [], blocked: [] }
  const states: DimensionAxisState[] = []
  const blocked: DimensionAxis[] = []
  const seen = new Set<DimensionAxis>()
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    if (!isAxis(obj.axis) || seen.has(obj.axis)) continue
    const labeled = readLabeledPositions(obj.positions)
    if (labeled.kind === "blocked") {
      seen.add(obj.axis)
      blocked.push(obj.axis)
      continue
    }
    if (labeled.kind === "ok") {
      const fromList = Array.isArray(obj.values_mm)
        ? obj.values_mm.map((value) => normalizeDimensionMm(value))
        : null
      if (
        fromList &&
        (fromList.some((value) => value == null) ||
          fromList.length !== labeled.positions.length ||
          fromList.some((value, index) => value !== labeled.positions[index].value_mm))
      ) {
        seen.add(obj.axis)
        blocked.push(obj.axis)
        continue
      }
      seen.add(obj.axis)
      states.push({
        axis: obj.axis,
        values_mm: labeled.positions.map((position) => position.value_mm),
        note: null,
        positions: labeled.positions,
      })
      continue
    }
    if (!Array.isArray(obj.values_mm) || obj.values_mm.length < 2) continue
    const values: number[] = []
    let valid = true
    for (const value of obj.values_mm) {
      const mm = normalizeDimensionMm(value)
      if (mm == null || values.includes(mm)) {
        valid = false
        break
      }
      values.push(mm)
    }
    if (!valid || values.length < 2) continue
    const note =
      typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : null
    seen.add(obj.axis)
    states.push({ axis: obj.axis, values_mm: values, note, positions: null })
  }
  states.sort((a, b) => AXES.indexOf(a.axis) - AXES.indexOf(b.axis))
  return { states, blocked }
}

export function readDimensionAxisStates(raw: unknown): DimensionAxisState[] {
  return readDimensionAxisBag(raw).states
}

export function hasAnyDimension(mm: ResolvedDimensionsMm): boolean {
  return (
    (mm.height_mm != null && mm.height_mm > 0) ||
    (mm.width_mm != null && mm.width_mm > 0) ||
    (mm.depth_mm != null && mm.depth_mm > 0)
  )
}

/** Prefer positive values only when writing snapshot / DTO bags. */
export function toSnapshotDimensions(
  mm: ResolvedDimensionsMm
): { unit: "mm"; height_mm?: number; width_mm?: number; depth_mm?: number } | null {
  const cleaned = readStructuredDimensionsMm(mm)
  if (!hasAnyDimension(cleaned)) return null
  const out: {
    unit: "mm"
    height_mm?: number
    width_mm?: number
    depth_mm?: number
  } = { unit: "mm" }
  if (cleaned.height_mm != null) out.height_mm = cleaned.height_mm
  if (cleaned.width_mm != null) out.width_mm = cleaned.width_mm
  if (cleaned.depth_mm != null) out.depth_mm = cleaned.depth_mm
  return out
}

/** Buyer compact bag used by existing presenters (optional keys, no zeros). */
export function toPresenterDimensions(mm: ResolvedDimensionsMm): {
  height_mm?: number
  width_mm?: number
  depth_mm?: number
} | null {
  const cleaned = readStructuredDimensionsMm(mm)
  if (!hasAnyDimension(cleaned)) return null
  const out: {
    height_mm?: number
    width_mm?: number
    depth_mm?: number
  } = {}
  if (cleaned.height_mm != null) out.height_mm = cleaned.height_mm
  if (cleaned.width_mm != null) out.width_mm = cleaned.width_mm
  if (cleaned.depth_mm != null) out.depth_mm = cleaned.depth_mm
  return out
}
