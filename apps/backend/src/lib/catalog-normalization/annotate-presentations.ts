/**
 * Annotate execution rows with presentation + semantic_type (PASS C write path).
 * Pure transform — migration script persists result.
 *
 * Preserves non-object / unknown entries in execution arrays (fail-closed:
 * never silently drop rows during annotation).
 */

import {
  resolveExecutionPresentation,
  type OptionPresentation,
} from "../option-presentation-contract"
import {
  canonicalizeFabricFamilyKey,
  isFabricFamilyKey,
  fabricFamilyDisplayLabel,
} from "../upholstery-color-normalization"

export type ExecutionRow = Record<string, unknown>

function annotateObjectRow(
  row: ExecutionRow,
  semantic: "upholstery" | "finish" | "frame" | "headboard"
): ExecutionRow {
  const swatch_hex =
    typeof row.swatch_hex === "string" ? row.swatch_hex.trim() : null
  const swatch_image =
    typeof row.swatch_image === "string"
      ? row.swatch_image.trim()
      : typeof row.swatch_url === "string"
        ? row.swatch_url.trim()
        : null
  const presentation = resolveExecutionPresentation({
    swatch_hex,
    swatch_image,
    presentation:
      typeof row.presentation === "string"
        ? (row.presentation as OptionPresentation)
        : null,
    swatch_type: typeof row.swatch_type === "string" ? row.swatch_type : null,
  })

  const next: ExecutionRow = {
    ...row,
    presentation,
    semantic_type: semantic,
    swatch_type:
      presentation === "swatch_image"
        ? "image"
        : presentation === "swatch_color"
          ? "color"
          : "none",
  }

  if (semantic === "upholstery" && typeof row.key === "string") {
    const key = row.key.trim()
    if (isFabricFamilyKey(key)) {
      next.key = canonicalizeFabricFamilyKey(key)
      if (!row.label || String(row.label).trim().toLowerCase() === key.toLowerCase()) {
        next.label = fabricFamilyDisplayLabel(key)
      }
    }
  }

  return next
}

export type PresentationNormalizeReport = {
  changed: boolean
  axes_touched: string[]
  rows_annotated: number
  rows_preserved_non_object: number
}

/**
 * Idempotent metadata annotation for buyer execution axes.
 */
export function annotateExecutionPresentations(
  metadata: Record<string, unknown>
): { metadata: Record<string, unknown>; report: PresentationNormalizeReport } {
  const next = { ...metadata }
  const axes_touched: string[] = []
  let rows_annotated = 0
  let rows_preserved_non_object = 0

  const pairs: Array<[string, "upholstery" | "finish" | "frame" | "headboard"]> = [
    ["fabric_upholstery_executions", "upholstery"],
    ["upholstery_color_executions", "upholstery"],
    ["finish_color_executions", "finish"],
    ["paint_finish_executions", "finish"],
    ["frame_material_executions", "frame"],
    ["headboard_model_executions", "headboard"],
  ]

  for (const [key, semantic] of pairs) {
    const raw = next[key]
    if (!Array.isArray(raw) || !raw.length) continue
    const annotated = raw.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        rows_preserved_non_object += 1
        return entry
      }
      return annotateObjectRow(entry as ExecutionRow, semantic)
    })
    const before = JSON.stringify(raw)
    const after = JSON.stringify(annotated)
    if (before !== after) {
      next[key] = annotated
      axes_touched.push(key)
      rows_annotated += annotated.filter(
        (r) => r && typeof r === "object" && !Array.isArray(r)
      ).length
    }
  }

  return {
    metadata: next,
    report: {
      changed: axes_touched.length > 0,
      axes_touched,
      rows_annotated,
      rows_preserved_non_object,
    },
  }
}
