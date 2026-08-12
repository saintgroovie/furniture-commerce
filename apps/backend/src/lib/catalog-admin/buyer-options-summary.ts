/**
 * Structured buyer-options summary for Medusa Admin (not native Medusa variants).
 * Fail-closed on malformed rows: never throw; never invent swatches from hero.
 */

import {
  CANONICAL_OPTION_GROUP_LABELS,
  isMedusaStubOptionTitle,
} from "../catalog-normalization/option-taxonomy"
import {
  isConfirmedSwatchHex,
  resolveExecutionPresentation,
  type OptionPresentation,
} from "../option-presentation-contract"

export type BuyerAxisSummary = {
  key: string
  label_ru: string
  value_count: number
  /** Sample labels (capped) for manager glance. */
  sample_labels: string[]
  presentation_counts: Partial<Record<OptionPresentation, number>>
  swatch_color_count: number
  swatch_image_count: number
  text_fallback_count: number
  malformed_row_count: number
  /** Content improvement, not P1 error. */
  texture_missing_as_content_debt: boolean
}

const AXIS_META: Array<{
  key: string
  label_ru: string
  canonical?: keyof typeof CANONICAL_OPTION_GROUP_LABELS
}> = [
  { key: "material_tiers", label_ru: CANONICAL_OPTION_GROUP_LABELS.material_tier, canonical: "material_tier" },
  { key: "finish_color_executions", label_ru: CANONICAL_OPTION_GROUP_LABELS.finish, canonical: "finish" },
  { key: "paint_finish_executions", label_ru: CANONICAL_OPTION_GROUP_LABELS.finish, canonical: "finish" },
  { key: "fabric_upholstery_executions", label_ru: CANONICAL_OPTION_GROUP_LABELS.upholstery, canonical: "upholstery" },
  { key: "upholstery_color_executions", label_ru: CANONICAL_OPTION_GROUP_LABELS.upholstery, canonical: "upholstery" },
  { key: "frame_material_executions", label_ru: CANONICAL_OPTION_GROUP_LABELS.frame, canonical: "frame" },
  { key: "headboard_model_executions", label_ru: CANONICAL_OPTION_GROUP_LABELS.headboard, canonical: "headboard" },
]

function rowLabel(row: Record<string, unknown>): string | null {
  for (const k of ["label", "label_ru", "title", "name", "key"]) {
    const v = row[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function summarizeAxis(
  key: string,
  label_ru: string,
  raw: unknown
): BuyerAxisSummary | null {
  if (!Array.isArray(raw) || raw.length === 0) return null

  let malformed = 0
  const labels: string[] = []
  const presentation_counts: Partial<Record<OptionPresentation, number>> = {}
  let swatch_color_count = 0
  let swatch_image_count = 0
  let text_fallback_count = 0
  let texture_missing = false

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      malformed += 1
      continue
    }
    const row = entry as Record<string, unknown>
    const label = rowLabel(row)
    if (label) labels.push(label)

    const presentation = resolveExecutionPresentation({
      swatch_hex: typeof row.swatch_hex === "string" ? row.swatch_hex : null,
      swatch_image:
        typeof row.swatch_image === "string"
          ? row.swatch_image
          : typeof row.swatch_url === "string"
            ? row.swatch_url
            : null,
      presentation: row.presentation as OptionPresentation | null,
      swatch_type: typeof row.swatch_type === "string" ? row.swatch_type : null,
    })
    presentation_counts[presentation] = (presentation_counts[presentation] ?? 0) + 1

    if (presentation === "swatch_color" && isConfirmedSwatchHex(row.swatch_hex)) {
      swatch_color_count += 1
    } else if (presentation === "swatch_image") {
      swatch_image_count += 1
    } else if (presentation === "text" || presentation === "material" || presentation === "size" || presentation === "model") {
      text_fallback_count += 1
      if (row.presentation === "swatch_image" && !row.swatch_image && !row.swatch_url) {
        texture_missing = true
      }
    }
  }

  const objectCount = raw.length - malformed
  if (objectCount <= 0 && malformed > 0) {
    return {
      key,
      label_ru,
      value_count: 0,
      sample_labels: [],
      presentation_counts: {},
      swatch_color_count: 0,
      swatch_image_count: 0,
      text_fallback_count: 0,
      malformed_row_count: malformed,
      texture_missing_as_content_debt: false,
    }
  }
  if (objectCount <= 0) return null

  return {
    key,
    label_ru,
    value_count: objectCount,
    sample_labels: labels.slice(0, 8),
    presentation_counts,
    swatch_color_count,
    swatch_image_count,
    text_fallback_count,
    malformed_row_count: malformed,
    texture_missing_as_content_debt: texture_missing,
  }
}

export function summarizeBuyerOptions(metadata: Record<string, unknown> | null | undefined): {
  axes: BuyerAxisSummary[]
  has_malformed: boolean
  has_texture_content_debt: boolean
} {
  const meta = metadata && typeof metadata === "object" ? metadata : {}
  const axes: BuyerAxisSummary[] = []
  let has_malformed = false
  let has_texture_content_debt = false

  for (const axis of AXIS_META) {
    const summary = summarizeAxis(axis.key, axis.label_ru, meta[axis.key])
    if (!summary) continue
    // Skip empty finish shadow when paint already listed? Keep both if both have values —
    // managers need honesty. Deduplicate only identical empty.
    axes.push(summary)
    if (summary.malformed_row_count > 0) has_malformed = true
    if (summary.texture_missing_as_content_debt) has_texture_content_debt = true
  }

  return { axes, has_malformed, has_texture_content_debt }
}

/** Native Medusa option groups after Default filtering — secondary fallback. */
export function summarizeNativeMedusaOptions(
  options: Array<{ title?: string; values?: Array<{ value?: string }> }> | null | undefined
): Array<{ title: string; values: string[] }> {
  return (options ?? [])
    .filter((o) => o?.title && !isMedusaStubOptionTitle(o.title))
    .map((o) => ({
      title: o.title!,
      values: (o.values ?? [])
        .map((v) => v?.value)
        .filter((v): v is string => !!v && !isMedusaStubOptionTitle(v)),
    }))
    .filter((o) => o.values.length > 0)
}

export function formatAxisGlance(axis: BuyerAxisSummary): string {
  const bits: string[] = [`${axis.value_count}`]
  if (axis.sample_labels.length) {
    bits.push(axis.sample_labels.slice(0, 4).join(" · "))
  }
  if (axis.swatch_color_count) {
    bits.push(`${axis.swatch_color_count} цветовых образцов`)
  }
  if (axis.swatch_image_count) {
    bits.push(`${axis.swatch_image_count} texture`)
  }
  if (axis.text_fallback_count && !axis.swatch_color_count && !axis.swatch_image_count) {
    bits.push("текстовые варианты")
  }
  if (axis.malformed_row_count) {
    bits.push(`⚠ ${axis.malformed_row_count} некорректных строк`)
  }
  return bits.join(" · ")
}
