import { model } from "@medusajs/framework/utils"

/**
 * Presentation slot for the catalog Promotion Window.
 *
 * Only "what to show in the special catalog cell". Commerce truth (base
 * price, sale price, validity) stays in native Medusa pricing (price lists).
 * No discount amount is duplicated here.
 */
export const PromotionSlot = model.define("promotion_slot", {
  id: model.id().primaryKey(),
  /** Stable lookup key - one slot per catalog surface (`catalog_main`). */
  key: model.text().unique(),
  enabled: model.boolean().default(false),
  /** Optional eyebrow / label shown on the card (RU). */
  label: model.text().nullable(),
  /** Ordered product ids - rotation order. */
  product_ids: model.json(),
  /** Optional presentation window (independent of price-list schedule). */
  starts_at: model.dateTime().nullable(),
  ends_at: model.dateTime().nullable(),
  /** Rotation interval in ms (6000..8000 canon; clamped by the service). */
  rotation_interval_ms: model.number().default(7000),
})
