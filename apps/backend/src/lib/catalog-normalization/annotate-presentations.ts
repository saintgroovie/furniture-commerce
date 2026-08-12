/**
 * Annotate execution rows with presentation + semantic_type (PASS C write path).
 * Pure transform — migration script persists result.
 *
 * Preserves non-object / unknown entries in execution arrays (fail-closed:
 * never silently drop rows during annotation).
 * Uses import-guards to strip hero-as-swatch and invalid hex when heroUrls given.
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
import { guardExecutionSwatchRow } from "./import-guards"

export type ExecutionRow = Record<string, unknown>

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function annotateObjectRow(
  row: ExecutionRow,
  semantic: "upholstery" | "finish" | "frame" | "headboard",
  heroUrls?: string[]
): ExecutionRow {
  let swatch_hex =
    typeof row.swatch_hex === "string" ? row.swatch_hex.trim() : null
  if (swatch_hex && !HEX_RE.test(swatch_hex)) {
    swatch_hex = null
  }
  let swatch_image =
    typeof row.swatch_image === "string"
      ? row.swatch_image.trim()
      : typeof row.swatch_url === "string"
        ? row.swatch_url.trim()
        : null

  const findings = guardExecutionSwatchRow(
    {
      presentation: row.presentation,
      swatch_hex,
      swatch_image,
      swatch_url: swatch_image,
    },
    { heroUrls }
  )
  if (findings.some((f) => f.code === "HERO_AS_SWATCH_URL")) {
    swatch_image = null
  }

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
  if (swatch_hex) next.swatch_hex = swatch_hex
  else delete next.swatch_hex
  if (swatch_image) next.swatch_image = swatch_image
  else {
    delete next.swatch_image
    delete next.swatch_url
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
 * Optional heroUrls enables import-guard stripping of hero-as-swatch.
 */
export function annotateExecutionPresentations(
  metadata: Record<string, unknown>,
  opts?: { heroUrls?: string[] }
): { metadata: Record<string, unknown>; report: PresentationNormalizeReport } {
  const next = { ...metadata }
  const axes_touched: string[] = []
  let rows_annotated = 0
  let rows_preserved_non_object = 0
  const heroUrls = opts?.heroUrls

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
      return annotateObjectRow(entry as ExecutionRow, semantic, heroUrls)
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
