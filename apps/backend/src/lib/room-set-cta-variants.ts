import { explicitOpeningVariant } from "./explicit-opening-variant"

/** Lean RoomSet DTO keeps the explicitly pinned size even when graph order changes. */
export function roomSetCtaVariants(product: Record<string, unknown>): { id: string }[] {
  const pin = explicitOpeningVariant(product)
  if (pin === null) return []
  if (pin !== undefined) return [{ id: String(pin.id) }]
  const records = Array.isArray(product.variants) ? product.variants : []
  const first = records.find((v) => v && typeof v === "object" &&
    typeof (v as Record<string, unknown>).id === "string" &&
    !(v as Record<string, unknown>).deleted_at) as Record<string, unknown> | undefined
  return first ? [{ id: String(first.id) }] : []
}
