import { AXIS_OWNER_LABEL, DIMENSION_AXIS_ORDER, type DimensionAxis } from "./types"
import type { ResolvedDimensionsMm } from "./types"
import { AXIS_TO_MM_KEY } from "./types"

function knownAxes(
  mm: ResolvedDimensionsMm
): Array<{ axis: DimensionAxis; value: number }> {
  const out: Array<{ axis: DimensionAxis; value: number }> = []
  for (const axis of DIMENSION_AXIS_ORDER) {
    const v = mm[AXIS_TO_MM_KEY[axis]]
    if (v != null) out.push({ axis, value: v })
  }
  return out
}

/** Full compact: "90×120×45" in cm (height→width→depth). Empty if none. */
export function formatDimensionsCompactCm(mm: ResolvedDimensionsMm): string {
  const parts = knownAxes(mm).map(({ value }) => String(Math.round(value / 10)))
  return parts.join("\u202F×\u202F")
}

/**
 * Buyer/Admin display lines without artificial zeros.
 * - 3 known → compact H×W×D with unit caption separately
 * - 1–2 known → labeled lines per axis
 * - none → null (caller chooses empty vs "Размеры уточняются")
 */
export function formatDimensionsForDisplay(
  mm: ResolvedDimensionsMm,
  opts?: { unit?: "cm" | "mm"; audience?: "buyer" | "admin" }
): {
  mode: "compact" | "partial" | "missing"
  compact: string | null
  lines: string[]
  missing_label: string
} {
  const unit = opts?.unit ?? "cm"
  const audience = opts?.audience ?? "buyer"
  const axes = knownAxes(mm)
  const missing_label =
    audience === "admin" ? "Размеры не указаны" : "Размеры уточняются"

  if (axes.length === 0) {
    return { mode: "missing", compact: null, lines: [], missing_label }
  }

  if (axes.length === 3) {
    const compact =
      unit === "mm"
        ? axes.map((a) => String(a.value)).join("\u202F×\u202F")
        : formatDimensionsCompactCm(mm)
    return { mode: "compact", compact, lines: [], missing_label }
  }

  const lines = axes.map(({ axis, value }) => {
    const label = AXIS_OWNER_LABEL[axis]
    if (unit === "mm") return `${label}: ${value} мм`
    return `${label}: ${Math.round(value / 10)} см`
  })
  return { mode: "partial", compact: null, lines, missing_label }
}
