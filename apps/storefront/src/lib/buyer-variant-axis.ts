/**
 * Buyer variant axis for one product.
 *
 * A chip row is built only from variants of this product:
 * a Medusa option other than Default, or a confirmed sleeping size.
 * Furniture height / width / depth are never turned into a mattress size.
 * Nothing here is specific to one collection or SKU.
 */

export type BuyerVariantChoice = {
  id: string
  sku: string
  label: string
  sort: number
}

export type BuyerVariantAxis = {
  label: string
  choices: BuyerVariantChoice[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function liveVariants(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = product.variants
  if (!Array.isArray(variants)) return []
  return variants.filter((item): item is Record<string, unknown> => {
    const variant = asRecord(item)
    return Boolean(variant && !variant.deleted_at && typeof variant.id === "string")
  })
}

function optionAxis(product: Record<string, unknown>): BuyerVariantAxis | null {
  const options = product.options
  if (!Array.isArray(options)) return null
  const real = options.filter((item) => {
    const option = asRecord(item)
    const title = typeof option?.title === "string" ? option.title.trim() : ""
    return Boolean(option && title && title.toLowerCase() !== "default")
  })
  if (real.length !== 1) return null
  const option = asRecord(real[0])
  if (!option || typeof option.title !== "string" || typeof option.id !== "string") return null
  const title = option.title.trim()
  const variants = liveVariants(product)
  if (variants.length < 2) return null
  const choices: BuyerVariantChoice[] = []
  for (const variant of variants) {
    const values = variant.options
    if (!Array.isArray(values) || typeof variant.sku !== "string" || !variant.sku) return null
    const match = values
      .map(asRecord)
      .find(
        (value) =>
          value &&
          typeof value.value === "string" &&
          value.value.trim() &&
          (value.option_id === option.id ||
            asRecord(value.option)?.title === title)
      )
    if (!match || typeof match.value !== "string") return null
    const rank = Number(variant.variant_rank)
    choices.push({
      id: variant.id as string,
      sku: variant.sku,
      label: match.value.trim(),
      sort: Number.isFinite(rank) ? rank : choices.length,
    })
  }
  const labels = new Set(choices.map((choice) => choice.label))
  if (labels.size !== choices.length) return null
  return {
    label: title,
    choices: choices.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "ru")),
  }
}

function confirmedMattress(variant: Record<string, unknown>): { label: string; sort: number } | null {
  const size = asRecord(asRecord(variant.metadata)?.mattress_size)
  if (!size || size.source !== "title" || size.confidence !== "high") return null
  const width = Number(size.width_cm)
  const length = Number(size.length_cm)
  if (!Number.isInteger(width) || !Number.isInteger(length) || width <= 0 || length <= 0) {
    return null
  }
  const display = `${width} × ${length} см`
  if (size.display != null && size.display !== display) return null
  if (size.key != null && size.key !== `${width}x${length}`) return null
  return { label: display, sort: width * 1000 + length }
}

/** One buyer axis, or null when this product is not a real multi-variant choice. */
export function buyerVariantAxis(product: Record<string, unknown>): BuyerVariantAxis | null {
  const fromOption = optionAxis(product)
  if (fromOption) return fromOption
  const variants = liveVariants(product)
  if (variants.length < 2) return null
  const choices: BuyerVariantChoice[] = []
  for (const variant of variants) {
    if (typeof variant.sku !== "string" || !variant.sku) return null
    const size = confirmedMattress(variant)
    if (!size) return null
    choices.push({
      id: variant.id as string,
      sku: variant.sku,
      label: size.label,
      sort: size.sort,
    })
  }
  return {
    label: "Размер спального места",
    choices: choices.sort((a, b) => a.sort - b.sort),
  }
}

export function resolveBuyerVariantId(
  axis: BuyerVariantAxis | null,
  requested: string | undefined
): string | null {
  if (!axis || axis.choices.length < 2) return null
  if (requested && axis.choices.some((choice) => choice.id === requested)) return requested
  return axis.choices[0]?.id ?? null
}

/** Chip target consumed by `/product/${chip.id}`. Keeps motif and other query keys. */
export function variantChipTarget(
  handle: string,
  variantId: string,
  search: Record<string, string | string[] | undefined> | undefined
): string {
  const params = new URLSearchParams()
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (key === "variant" || value == null) continue
      const one = Array.isArray(value) ? value[0] : value
      if (one) params.set(key, one)
    }
  }
  params.set("variant", variantId)
  return `${handle}?${params.toString()}`
}
