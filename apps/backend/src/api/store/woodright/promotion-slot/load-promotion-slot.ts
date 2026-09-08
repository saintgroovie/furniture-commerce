/**
 * Shared loader for the catalog Promotion Window payload.
 * Used by the public store route and the admin preview - one resolution path.
 *
 * Products are loaded by exact ids through the same graph + pricing +
 * default-configuration pipeline as `/store/catalog-products`, then run
 * through the pure resolver. Wire DTO reuses the catalog browse projection
 * so the storefront `ProductCard` primitives render it unchanged.
 */
import type { MedusaRequest } from "@medusajs/framework/http"
import { PROMOTION_SLOT_MODULE } from "../../../../modules/promotion-slot"
import type PromotionSlotModuleService from "../../../../modules/promotion-slot/service"
import {
  resolvePromotionItems,
  type PromotionCandidateProduct,
  type PromotionResolution,
  type ResolvedPromotionItem,
} from "../../../../modules/promotion-slot/resolve-promotion-items"
import {
  clampRotationInterval,
  normalizeProductIds,
  type PromotionSlotRecord,
} from "../../../../modules/promotion-slot/slot-contract"
import { loadStoreProductList } from "../../products/load-store-product-list"
import { projectCatalogBrowseProduct } from "../../products/catalog-browse-projection"
import { attachBuyerPurchaseContract } from "../../products/attach-buyer-purchase"

export type PromotionSlotStoreItem = ResolvedPromotionItem & {
  product: Record<string, unknown>
}

export type PromotionSlotStorePayload = {
  slot: {
    id: string
    key: string
    label: string | null
    rotation_interval_ms: number
    updated_at: string | null
  } | null
  /** Empty → storefront renders the plain catalog. */
  items: PromotionSlotStoreItem[]
}

/**
 * Load slot + candidate products + purchase contract.
 * `product_sales_policy` is fetched separately (browse graph omits it) so the
 * resolver can skip products that are not purchasable.
 */
export async function loadPromotionSlotResolution(req: MedusaRequest): Promise<{
  slot: PromotionSlotRecord | null
  resolution: PromotionResolution
  productsById: Map<string, PromotionCandidateProduct>
}> {
  const slotService = req.scope.resolve(
    PROMOTION_SLOT_MODULE
  ) as PromotionSlotModuleService
  const slot = await slotService.retrieveCatalogSlot()
  const ids = slot ? normalizeProductIds(slot.product_ids) : []
  const productsById = new Map<string, PromotionCandidateProduct>()

  if (slot && slot.enabled && ids.length > 0) {
    const products = await loadStoreProductList(req, { mode: "browse", ids })
    const policies = await loadSalesPolicies(req, ids)
    for (const raw of products) {
      const id = typeof raw.id === "string" ? raw.id : null
      if (!id) continue
      if (policies === null) {
        /* Fail closed: policy link unavailable → never promote a product whose
           explicit policy (quote_required / only_as_set / unavailable) we
           could not read. The card hides instead of overselling. */
        productsById.set(id, {
          ...raw,
          purchase: { can_purchase: false, reason_code: "sales_policy_unavailable" },
        } as PromotionCandidateProduct)
        continue
      }
      const withPolicy = policies.has(id)
        ? { ...raw, product_sales_policy: policies.get(id) }
        : raw
      productsById.set(id, attachBuyerPurchaseContract(withPolicy))
    }
  }

  return { slot, resolution: resolvePromotionItems(slot, productsById), productsById }
}

/**
 * Explicit sales policies by product id. Returns `null` when the policy link
 * could not be read at all - callers must treat that as "not purchasable"
 * (fail closed), never as "no policy → default rules".
 */
async function loadSalesPolicies(
  req: MedusaRequest,
  productIds: string[]
): Promise<Map<string, Record<string, unknown>> | null> {
  const out = new Map<string, Record<string, unknown>>()
  if (productIds.length === 0) return out
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }
  try {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "product_sales_policy.*"],
      filters: { id: productIds },
    })
    for (const row of data ?? []) {
      const p = row as { id?: unknown; product_sales_policy?: unknown }
      if (typeof p.id !== "string") continue
      const policy = Array.isArray(p.product_sales_policy)
        ? p.product_sales_policy[0]
        : p.product_sales_policy
      if (policy && typeof policy === "object") {
        out.set(p.id, policy as Record<string, unknown>)
      }
    }
  } catch {
    /* Policy link unavailable → fail closed (card hides). */
    return null
  }
  return out
}

export function toPromotionSlotStorePayload(
  slot: PromotionSlotRecord | null,
  resolution: PromotionResolution,
  productsById: ReadonlyMap<string, PromotionCandidateProduct>
): PromotionSlotStorePayload {
  if (!slot || !resolution.active || resolution.items.length === 0) {
    return { slot: null, items: [] }
  }
  const items: PromotionSlotStoreItem[] = []
  for (const item of resolution.items) {
    const product = productsById.get(item.product_id)
    if (!product) continue
    items.push({
      ...item,
      product: projectCatalogBrowseProduct(product as Record<string, unknown>),
    })
  }
  if (items.length === 0) return { slot: null, items: [] }
  return {
    slot: {
      id: slot.id,
      key: slot.key,
      label: slot.label ?? null,
      rotation_interval_ms: clampRotationInterval(slot.rotation_interval_ms),
      updated_at: slot.updated_at ? new Date(slot.updated_at).toISOString() : null,
    },
    items,
  }
}
