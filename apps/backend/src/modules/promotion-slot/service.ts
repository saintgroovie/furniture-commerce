import { MedusaService } from "@medusajs/framework/utils"
import { PromotionSlot } from "./models/promotion-slot"
import {
  CATALOG_MAIN_SLOT_KEY,
  normalizePromotionSlotInput,
  type PromotionSlotRecord,
  type PromotionSlotUpdateInput,
} from "./slot-contract"

class PromotionSlotModuleService extends MedusaService({
  PromotionSlot,
}) {
  /** Read the single catalog slot (null when never configured). */
  async retrieveCatalogSlot(): Promise<PromotionSlotRecord | null> {
    const rows = (await this.listPromotionSlots(
      { key: CATALOG_MAIN_SLOT_KEY },
      { take: 1 }
    )) as unknown as PromotionSlotRecord[]
    return rows[0] ?? null
  }

  /**
   * Upsert the catalog slot. Partial input merges over the existing row;
   * a missing row is created with safe defaults (disabled, no products).
   */
  async upsertCatalogSlot(
    input: PromotionSlotUpdateInput
  ): Promise<PromotionSlotRecord> {
    const existing = await this.retrieveCatalogSlot()
    const normalized = normalizePromotionSlotInput(input, existing)
    /* `model.json()` is typed as Record; a JSON array is valid jsonb. */
    const data = {
      ...normalized,
      product_ids: normalized.product_ids as unknown as Record<string, unknown>,
    }
    if (existing) {
      const updated = (await this.updatePromotionSlots({
        id: existing.id,
        ...data,
      })) as unknown as PromotionSlotRecord
      return updated
    }
    const created = (await this.createPromotionSlots({
      key: CATALOG_MAIN_SLOT_KEY,
      ...data,
    })) as unknown as PromotionSlotRecord
    return created
  }
}

export default PromotionSlotModuleService
