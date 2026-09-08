/**
 * Native Medusa price list used by the catalog Promotion Window.
 *
 * One `sale` price list ("Промо в каталоге") is the commerce SoT for
 * discounts: Store API `calculated_price` and cart pricing read it natively.
 * This helper only finds/creates that list and upserts per-variant RUB sale
 * prices so the seller flow stays "one discount field per product" while the
 * native Admin price-list editor remains available for advanced cases.
 */
import { Modules } from "@medusajs/framework/utils"

export const CATALOG_PROMO_PRICE_LIST_TITLE = "Промо в каталоге"
export const CATALOG_PROMO_PRICE_LIST_DESCRIPTION =
  "Скидочные цены для промо-окна в каталоге (Woodright Workspace)"
export const CATALOG_PROMO_CURRENCY = "rub"

export type PriceListRow = {
  id: string
  title?: string | null
  status?: string | null
  type?: string | null
  starts_at?: Date | string | null
  ends_at?: Date | string | null
  created_at?: Date | string | null
  prices?: Array<{ id: string; amount?: number | string; price_set_id?: string }>
}

export type PriceRow = {
  id: string
  amount?: number | string
  currency_code?: string
  price_set_id?: string
  price_list_id?: string | null
}

export type PricingModulePort = {
  listPriceLists: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<PriceListRow[]>
  createPriceLists: (data: Array<Record<string, unknown>>) => Promise<PriceListRow[]>
  updatePriceLists: (data: Array<Record<string, unknown>>) => Promise<PriceListRow[]>
  listPrices: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<PriceRow[]>
  addPriceListPrices: (
    data: Array<{ price_list_id: string; prices: Array<Record<string, unknown>> }>
  ) => Promise<unknown>
  updatePriceListPrices: (
    data: Array<{ price_list_id: string; prices: Array<Record<string, unknown>> }>
  ) => Promise<unknown>
  removePrices: (ids: string[]) => Promise<void>
  deletePriceLists?: (ids: string[]) => Promise<void>
}

/** Same-title price list that is not a `sale` list - never used as promo SoT. */
export class CatalogPromoPriceListConflictError extends Error {
  readonly code = "catalog_promo_price_list_conflict" as const
  constructor(readonly priceListId: string, readonly type: string | null | undefined) {
    super(
      `Price list "${CATALOG_PROMO_PRICE_LIST_TITLE}" (${priceListId}) has type ${String(
        type
      )}; the promotion window requires a native "sale" list. Rename or delete it in Medusa Admin.`
    )
    this.name = "CatalogPromoPriceListConflictError"
  }
}

function createdAtMs(row: PriceListRow): number {
  const v = row.created_at
  const t = v instanceof Date ? v.getTime() : v ? Date.parse(String(v)) : NaN
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER
}

/** Deterministic pick: oldest `sale` list wins so every caller agrees. */
function pickPromoPriceList(rows: PriceListRow[]): PriceListRow | null {
  const sale = rows
    .filter((r) => r.type === "sale")
    .sort((a, b) => createdAtMs(a) - createdAtMs(b) || a.id.localeCompare(b.id))
  if (sale.length > 0) return sale[0]
  const other = rows[0]
  if (other) throw new CatalogPromoPriceListConflictError(other.id, other.type)
  return null
}

type Scope = { resolve: (key: string) => unknown }

export function resolvePricingModule(scope: Scope): PricingModulePort {
  return scope.resolve(Modules.PRICING) as PricingModulePort
}

export async function findCatalogPromoPriceList(
  pricing: PricingModulePort
): Promise<PriceListRow | null> {
  const rows = await pricing.listPriceLists(
    { title: CATALOG_PROMO_PRICE_LIST_TITLE },
    { take: 10 }
  )
  return pickPromoPriceList(rows)
}

/**
 * Find or create the promo price list. Idempotent (title lookup, oldest sale
 * list wins). Concurrent first-time callers may both create a list; the loser
 * re-reads, adopts the oldest and deletes its own empty duplicate.
 */
export async function ensureCatalogPromoPriceList(
  pricing: PricingModulePort
): Promise<{ priceList: PriceListRow; created: boolean }> {
  const existing = await findCatalogPromoPriceList(pricing)
  if (existing) return { priceList: existing, created: false }
  const [created] = await pricing.createPriceLists([
    {
      title: CATALOG_PROMO_PRICE_LIST_TITLE,
      description: CATALOG_PROMO_PRICE_LIST_DESCRIPTION,
      type: "sale",
      status: "active",
      prices: [],
    },
  ])
  if (!created) throw new Error("Failed to create catalog promo price list")
  const canonical = await findCatalogPromoPriceList(pricing)
  if (canonical && canonical.id !== created.id) {
    /* Lost the race: another caller created the list first. Our copy has no
       prices yet - drop it so exactly one promo list remains. */
    if (pricing.deletePriceLists) {
      await pricing.deletePriceLists([created.id]).catch(() => undefined)
    }
    return { priceList: canonical, created: false }
  }
  return { priceList: created, created: true }
}

/** Sale RUB prices in the promo list keyed by price_set_id. */
export async function listCatalogPromoPrices(
  pricing: PricingModulePort,
  priceListId: string,
  priceSetIds?: string[]
): Promise<Map<string, PriceRow>> {
  const filters: Record<string, unknown> = {
    price_list_id: [priceListId],
    currency_code: CATALOG_PROMO_CURRENCY,
  }
  if (priceSetIds && priceSetIds.length > 0) filters.price_set_id = priceSetIds
  const rows = await pricing.listPrices(filters, { take: 500 })
  const out = new Map<string, PriceRow>()
  for (const row of rows) {
    if (typeof row.price_set_id === "string") out.set(row.price_set_id, row)
  }
  return out
}

export function priceAmount(row: PriceRow | undefined | null): number | null {
  if (!row) return null
  const n = typeof row.amount === "string" ? Number(row.amount) : row.amount
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null
}

export type UpsertPromoPriceResult =
  | { action: "created"; price_id: string; amount: number }
  | { action: "updated"; price_id: string; amount: number; previous_amount: number | null }
  | { action: "unchanged"; price_id: string; amount: number }

/**
 * Set the sale RUB price for one variant price set (create or update).
 * Caller validates `amount < base price`.
 */
export async function upsertCatalogPromoPrice(
  pricing: PricingModulePort,
  priceListId: string,
  priceSetId: string,
  amount: number
): Promise<UpsertPromoPriceResult> {
  const current = (await listCatalogPromoPrices(pricing, priceListId, [priceSetId])).get(
    priceSetId
  )
  if (current) {
    const previous = priceAmount(current)
    if (previous === amount) {
      return { action: "unchanged", price_id: current.id, amount }
    }
    await pricing.updatePriceListPrices([
      {
        price_list_id: priceListId,
        prices: [
          {
            id: current.id,
            price_set_id: priceSetId,
            currency_code: CATALOG_PROMO_CURRENCY,
            amount,
          },
        ],
      },
    ])
    return { action: "updated", price_id: current.id, amount, previous_amount: previous }
  }
  await pricing.addPriceListPrices([
    {
      price_list_id: priceListId,
      prices: [{ price_set_id: priceSetId, currency_code: CATALOG_PROMO_CURRENCY, amount }],
    },
  ])
  const created = (await listCatalogPromoPrices(pricing, priceListId, [priceSetId])).get(
    priceSetId
  )
  if (!created) throw new Error("Promo price was not persisted")
  return { action: "created", price_id: created.id, amount }
}

/** Remove the sale price for one price set (no-op when absent). */
export async function removeCatalogPromoPrice(
  pricing: PricingModulePort,
  priceListId: string,
  priceSetId: string
): Promise<{ removed: boolean; price_id: string | null }> {
  const current = (await listCatalogPromoPrices(pricing, priceListId, [priceSetId])).get(
    priceSetId
  )
  if (!current) return { removed: false, price_id: null }
  await pricing.removePrices([current.id])
  return { removed: true, price_id: current.id }
}

/** Sale amount for a percent discount, rounded to whole rubles (never ≥ base). */
export function saleAmountForPercent(basePrice: number, percent: number): number | null {
  if (!(basePrice > 0) || !(percent > 0) || percent >= 100) return null
  const sale = Math.round(basePrice * (1 - percent / 100))
  return sale > 0 && sale < basePrice ? sale : null
}

export function isPriceListActiveNow(
  priceList: Pick<PriceListRow, "status" | "starts_at" | "ends_at"> | null,
  now: Date = new Date()
): boolean {
  if (!priceList) return false
  if (priceList.status && priceList.status !== "active") return false
  const t = now.getTime()
  if (priceList.starts_at) {
    const s = new Date(priceList.starts_at).getTime()
    if (!Number.isNaN(s) && s > t) return false
  }
  if (priceList.ends_at) {
    const e = new Date(priceList.ends_at).getTime()
    if (!Number.isNaN(e) && e <= t) return false
  }
  return true
}
