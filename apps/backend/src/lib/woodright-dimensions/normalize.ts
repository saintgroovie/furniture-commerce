import type { DimensionMmKey, ResolvedDimensionsMm } from "./types"

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
