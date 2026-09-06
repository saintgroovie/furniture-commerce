/**
 * Detect Woodright execution/finish media contracts on product metadata.
 * Pricing-only `material_tiers` is not a media contract.
 */
export const EXECUTION_ARRAY_KEYS = [
  "paint_finish_executions",
  "finish_color_executions",
  "fabric_upholstery_executions",
  "upholstery_color_executions",
  "frame_material_executions",
  "construction_tier_executions",
  "material_tier_executions",
  "headboard_model_executions",
  "bed_execution_matrix",
  "greenwich_paint_execution_matrix",
  "shared_scene_media",
] as const

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

export function hasExecutionMediaContract(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  if (!metadata) return false

  const contract = metadata.execution_dimension_contract
  if (typeof contract === "string" && contract.trim().length > 0) return true

  for (const key of EXECUTION_ARRAY_KEYS) {
    if (isNonEmptyArray(metadata[key])) return true
  }

  return false
}
