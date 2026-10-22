/**
 * Variant-specific finish and material capabilities.
 * Product metadata stays the shared default. Checkout and PDP must read the
 * selected variant's bag when it exists, and must not inherit another SKU's set.
 */

export const VARIANT_CAPABILITY_KEYS = [
  "shared_scene_media",
  "bed_execution_matrix",
  "greenwich_paint_execution_matrix",
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

export function productMetadataForVariant(
  productMetadata: Record<string, unknown> | null | undefined,
  variantMetadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const next = { ...(productMetadata ?? {}) }
  const raw = variantMetadata?.capabilities
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next
  const capabilities = raw as Record<string, unknown>
  for (const key of VARIANT_CAPABILITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(capabilities, key)) next[key] = capabilities[key]
    else delete next[key]
  }
  return next
}
