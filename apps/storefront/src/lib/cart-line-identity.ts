/**
 * Stable cart line configuration identity.
 * Product / variant id alone must not collapse distinct buyer configs.
 */

export function cartLineConfigurationIdentity(item: {
  variant_id?: string
  product_id?: string
  metadata?: Record<string, unknown> | null
}): string {
  const meta = item.metadata ?? {}
  const parts = [
    item.variant_id ?? "",
    item.product_id ?? "",
    typeof meta.material_execution_code === "string"
      ? meta.material_execution_code
      : "",
    typeof meta.finish_execution_key === "string" ? meta.finish_execution_key : "",
    Array.isArray(meta.execution_specs)
      ? JSON.stringify(meta.execution_specs)
      : "",
  ]
  return parts.join("|")
}
