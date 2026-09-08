import type { MedusaRequest } from "@medusajs/framework/http"
import {
  findCatalogPromoPriceList,
  listCatalogPromoPrices,
  isPriceListActiveNow,
  resolvePricingModule,
  type PriceListRow,
  type PriceRow,
} from "../../../../lib/woodright-admin/catalog-promo-price-list"
import {
  buildCatalogPromoAdminProduct,
  CATALOG_PROMO_PRODUCT_GRAPH_FIELDS,
  type CatalogPromoAdminProduct,
  type CatalogPromoAdminState,
} from "../../../../lib/woodright-admin/catalog-promo-admin"
import { PROMOTION_SLOT_MODULE } from "../../../../modules/promotion-slot"
import type PromotionSlotModuleService from "../../../../modules/promotion-slot/service"
import {
  clampRotationInterval,
  normalizeProductIds,
  type PromotionSlotRecord,
} from "../../../../modules/promotion-slot/slot-contract"

export type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
    pagination?: { skip?: number; take?: number }
  }) => Promise<{ data: unknown[] }>
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function priceListAdminPath(priceList: PriceListRow | null): string | null {
  return priceList ? `/app/price-lists/${priceList.id}` : null
}

export async function loadPromoProductsByIds(
  req: MedusaRequest,
  productIds: string[],
  priceList: PriceListRow | null
): Promise<CatalogPromoAdminProduct[]> {
  if (productIds.length === 0) return []
  const query = req.scope.resolve("query") as QueryGraph
  const { data } = await query.graph({
    entity: "product",
    fields: [...CATALOG_PROMO_PRODUCT_GRAPH_FIELDS],
    filters: { id: productIds },
  })
  const raws = (data ?? []) as Array<Record<string, unknown>>
  const byId = new Map(raws.map((r) => [String(r.id), r]))
  const promoPrices = await loadPromoPrices(req, priceList, raws)
  const out: CatalogPromoAdminProduct[] = []
  for (const id of productIds) {
    const raw = byId.get(id)
    if (!raw) continue
    out.push(buildCatalogPromoAdminProduct(raw, promoPrices, priceList))
  }
  return out
}

export async function loadPromoPrices(
  req: MedusaRequest,
  priceList: PriceListRow | null,
  raws: Array<Record<string, unknown>>
): Promise<Map<string, PriceRow>> {
  if (!priceList) return new Map()
  const priceSetIds: string[] = []
  for (const raw of raws) {
    const variants = Array.isArray(raw.variants)
      ? (raw.variants as Array<Record<string, unknown>>)
      : []
    const ps = variants[0]?.price_set as { id?: unknown } | undefined
    if (typeof ps?.id === "string") priceSetIds.push(ps.id)
  }
  if (priceSetIds.length === 0) return new Map()
  const pricing = resolvePricingModule(req.scope)
  return listCatalogPromoPrices(pricing, priceList.id, priceSetIds)
}

export async function loadCatalogPromoState(
  req: MedusaRequest
): Promise<CatalogPromoAdminState> {
  const slotService = req.scope.resolve(
    PROMOTION_SLOT_MODULE
  ) as PromotionSlotModuleService
  const pricing = resolvePricingModule(req.scope)
  const [slot, priceList] = await Promise.all([
    slotService.retrieveCatalogSlot(),
    findCatalogPromoPriceList(pricing),
  ])
  const productIds = slot ? normalizeProductIds(slot.product_ids) : []
  const products = await loadPromoProductsByIds(req, productIds, priceList)
  return toCatalogPromoState(slot, priceList, products)
}

export function toCatalogPromoState(
  slot: PromotionSlotRecord | null,
  priceList: PriceListRow | null,
  products: CatalogPromoAdminProduct[]
): CatalogPromoAdminState {
  return {
    slot: {
      id: slot?.id ?? null,
      enabled: Boolean(slot?.enabled),
      label: slot?.label ?? null,
      product_ids: slot ? normalizeProductIds(slot.product_ids) : [],
      starts_at: iso(slot?.starts_at ?? null),
      ends_at: iso(slot?.ends_at ?? null),
      rotation_interval_ms: clampRotationInterval(slot?.rotation_interval_ms),
      updated_at: iso(slot?.updated_at ?? null),
    },
    price_list: {
      id: priceList?.id ?? null,
      title: priceList?.title ?? null,
      status: priceList?.status ?? null,
      starts_at: iso(priceList?.starts_at ?? null),
      ends_at: iso(priceList?.ends_at ?? null),
      active_now: isPriceListActiveNow(priceList),
      admin_path: priceListAdminPath(priceList),
    },
    products,
  }
}
