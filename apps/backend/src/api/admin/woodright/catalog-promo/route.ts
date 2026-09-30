import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withPromoErrors } from "./with-promo-errors"
import { PROMOTION_SLOT_MODULE } from "../../../../modules/promotion-slot"
import type PromotionSlotModuleService from "../../../../modules/promotion-slot/service"
import {
  PromotionSlotValidationError,
  type PromotionSlotUpdateInput,
} from "../../../../modules/promotion-slot/slot-contract"
import { loadCatalogPromoState } from "./load-catalog-promo-state"
import { appendDeskAudit } from "../../../../lib/woodright-workspace/desk-audit"
import { requireDeskWrite } from "../../../../lib/woodright-workspace/require-desk-write"

/**
 * Catalog Promotion Window - seller workspace state.
 * GET /admin/woodright/catalog-promo
 */
async function getHandler(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  res.json(await loadCatalogPromoState(req))
}

function parseSlotBody(body: unknown):
  | { ok: true; value: PromotionSlotUpdateInput }
  | { ok: false; message: string; field?: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Пустой запрос" }
  }
  const b = body as Record<string, unknown>
  const value: PromotionSlotUpdateInput = {}
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== "boolean") {
      return { ok: false, message: "enabled должен быть true/false", field: "enabled" }
    }
    value.enabled = b.enabled
  }
  if (b.label !== undefined) {
    if (b.label !== null && typeof b.label !== "string") {
      return { ok: false, message: "label должен быть строкой", field: "label" }
    }
    value.label = b.label as string | null
  }
  if (b.product_ids !== undefined) {
    if (!Array.isArray(b.product_ids) || b.product_ids.some((x) => typeof x !== "string")) {
      return { ok: false, message: "product_ids - список id", field: "product_ids" }
    }
    value.product_ids = b.product_ids as string[]
  }
  if (b.starts_at !== undefined) value.starts_at = b.starts_at as string | null
  if (b.ends_at !== undefined) value.ends_at = b.ends_at as string | null
  if (b.rotation_interval_ms !== undefined) {
    const n =
      typeof b.rotation_interval_ms === "string"
        ? Number(b.rotation_interval_ms)
        : b.rotation_interval_ms
    if (typeof n !== "number" || !Number.isFinite(n)) {
      return {
        ok: false,
        message: "rotation_interval_ms - число",
        field: "rotation_interval_ms",
      }
    }
    value.rotation_interval_ms = n
  }
  return { ok: true, value }
}

/**
 * Save slot configuration (partial merge).
 * PUT /admin/woodright/catalog-promo
 */
async function putHandler(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const gate = await requireDeskWrite(req, res, "promotions.manage")
  if (!gate) return
  const parsed = parseSlotBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ code: "invalid_body", message: parsed.message, field: parsed.field })
    return
  }
  const slotService = req.scope.resolve(
    PROMOTION_SLOT_MODULE
  ) as PromotionSlotModuleService
  const before = await loadCatalogPromoState(req)
  try {
    await slotService.upsertCatalogSlot(parsed.value)
  } catch (error) {
    if (error instanceof PromotionSlotValidationError) {
      res.status(400).json({ code: "validation", message: error.message, field: error.field })
      return
    }
    throw error
  }
  const after = await loadCatalogPromoState(req)
  const audit = await appendDeskAudit(req, {
    actorId: gate.actorId,
    actorEmail: gate.email,
    entityType: "promotion_slot",
    entityId: after.slot.id ?? "catalog_main",
    action: "slot.update",
    before: { enabled: before.slot.enabled, product_ids: before.slot.product_ids },
    after: { enabled: after.slot.enabled, product_ids: after.slot.product_ids },
  })
  res.json({ ...after, audit })
}

export const GET = withPromoErrors(getHandler)
export const PUT = withPromoErrors(putHandler)
