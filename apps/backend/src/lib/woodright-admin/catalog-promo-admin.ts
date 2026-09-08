/**
 * Pure helpers for the admin "Промо в каталоге" workspace.
 * Builds seller-facing rows from raw product graph + promo price list rows.
 * No Medusa runtime imports.
 */
import { parseMaterialTiers, resolveMaterialTierPrice } from "../material-tier-contract"
import { isPriceListActiveNow, priceAmount, type PriceListRow, type PriceRow } from "./catalog-promo-price-list"

/** Graph fields needed to build promo admin rows for products. */
export const CATALOG_PROMO_PRODUCT_GRAPH_FIELDS = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "metadata",
  "images.url",
  "variants.id",
  "variants.sku",
  "variants.price_set.id",
  "variants.price_set.prices.id",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.currency_code",
  "variants.price_set.prices.price_list_id",
  "product_classification.product_type",
] as const

export type CatalogPromoAdminProduct = {
  product_id: string
  handle: string | null
  title: string
  status: string | null
  thumbnail: string | null
  product_type: string | null
  variant_id: string | null
  sku: string | null
  price_set_id: string | null
  /** Base RUB price of the opening variant (price_set.prices, no price list). */
  base_price: number | null
  /** Sale RUB price in the promo price list (null = no discount set). */
  sale_price: number | null
  sale_price_id: string | null
  discount_percent: number | null
  /** Buyer-facing opening prices after material tier multiplier (what the card shows). */
  buyer_base_price: number | null
  buyer_sale_price: number | null
  /** Why the card would skip this product (null = eligible). */
  blocker:
    | null
    | "unpublished"
    | "bespoke"
    | "no_base_price"
    | "no_sale_price"
    | "sale_not_lower"
    | "no_image"
    | "price_list_inactive"
}

export type CatalogPromoAdminState = {
  slot: {
    id: string | null
    enabled: boolean
    label: string | null
    product_ids: string[]
    starts_at: string | null
    ends_at: string | null
    rotation_interval_ms: number
    updated_at: string | null
  }
  price_list: {
    id: string | null
    title: string | null
    status: string | null
    starts_at: string | null
    ends_at: string | null
    active_now: boolean
    /** Native Medusa Admin path for advanced editing. */
    admin_path: string | null
  }
  products: CatalogPromoAdminProduct[]
}

function positive(n: unknown): number | null {
  const v = typeof n === "string" ? Number(n) : n
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null
}

function hasImage(raw: Record<string, unknown>): boolean {
  if (typeof raw.thumbnail === "string" && raw.thumbnail.trim()) return true
  const images = raw.images
  return (
    Array.isArray(images) &&
    images.some(
      (i) =>
        i && typeof i === "object" && typeof (i as { url?: unknown }).url === "string"
    )
  )
}

export function openingTierMultiplier(raw: Record<string, unknown>): number {
  const meta =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : null
  const tiers = parseMaterialTiers(meta)
  return tiers && tiers.length > 0 ? tiers[0]!.price_multiplier : 1
}

/**
 * Build one admin row. `promoPrices` is keyed by price_set_id.
 * Opening variant = variants[0] (same rule as storefront / buyer defaults).
 */
export function buildCatalogPromoAdminProduct(
  raw: Record<string, unknown>,
  promoPrices: ReadonlyMap<string, PriceRow>,
  priceList: PriceListRow | null,
  now: Date = new Date()
): CatalogPromoAdminProduct {
  const variants = Array.isArray(raw.variants)
    ? (raw.variants as Array<Record<string, unknown>>)
    : []
  const v0 = variants[0] ?? null
  const priceSet = v0?.price_set as
    | { id?: unknown; prices?: Array<Record<string, unknown>> }
    | undefined
  const priceSetId = typeof priceSet?.id === "string" ? priceSet.id : null

  let basePrice: number | null = null
  for (const p of priceSet?.prices ?? []) {
    if (!p || typeof p !== "object") continue
    if (p.price_list_id) continue
    const cc = typeof p.currency_code === "string" ? p.currency_code.toLowerCase() : "rub"
    if (cc !== "rub") continue
    const amount = positive(p.amount)
    if (amount != null) {
      basePrice = amount
      break
    }
  }

  const saleRow = priceSetId ? promoPrices.get(priceSetId) : undefined
  const salePrice = priceAmount(saleRow)
  const productType =
    ((raw.product_classification as { product_type?: unknown } | undefined)
      ?.product_type as string | undefined) ?? null
  const status = typeof raw.status === "string" ? raw.status : null

  let blocker: CatalogPromoAdminProduct["blocker"] = null
  if (status && status !== "published") blocker = "unpublished"
  else if (productType === "BESPOKE") blocker = "bespoke"
  else if (basePrice == null) blocker = "no_base_price"
  else if (salePrice == null) blocker = "no_sale_price"
  else if (salePrice >= basePrice) blocker = "sale_not_lower"
  else if (!isPriceListActiveNow(priceList, now)) blocker = "price_list_inactive"
  else if (!hasImage(raw)) blocker = "no_image"

  const multiplier = openingTierMultiplier(raw)
  const discount =
    basePrice != null && salePrice != null && salePrice < basePrice
      ? Math.round(((basePrice - salePrice) / basePrice) * 100)
      : null

  return {
    product_id: String(raw.id),
    handle: typeof raw.handle === "string" ? raw.handle : null,
    title: typeof raw.title === "string" ? raw.title : "",
    status,
    thumbnail: typeof raw.thumbnail === "string" ? raw.thumbnail : null,
    product_type: productType,
    variant_id: typeof v0?.id === "string" ? (v0.id as string) : null,
    sku: typeof v0?.sku === "string" ? (v0.sku as string) : null,
    price_set_id: priceSetId,
    base_price: basePrice,
    sale_price: salePrice,
    sale_price_id: saleRow?.id ?? null,
    discount_percent: discount,
    buyer_base_price:
      basePrice != null ? resolveMaterialTierPrice(basePrice, multiplier) : null,
    buyer_sale_price:
      salePrice != null ? resolveMaterialTierPrice(salePrice, multiplier) : null,
    blocker,
  }
}

export type PromoDiscountInput =
  | { mode: "percent"; percent: number }
  | { mode: "amount"; sale_price: number }
  | { mode: "clear" }

export type ParsedPromoDiscount =
  | { ok: true; value: PromoDiscountInput }
  | { ok: false; code: string; message: string; field?: string }

/** Parse seller discount payload: `{ percent }` | `{ sale_price }` | `{ clear: true }`. */
export function parsePromoDiscountBody(body: unknown): ParsedPromoDiscount {
  if (!body || typeof body !== "object") {
    return { ok: false, code: "invalid_body", message: "Нужно указать скидку" }
  }
  const b = body as Record<string, unknown>
  if (b.clear === true) return { ok: true, value: { mode: "clear" } }
  if (b.percent !== undefined) {
    const percent = typeof b.percent === "string" ? Number(b.percent) : b.percent
    if (
      typeof percent !== "number" ||
      !Number.isFinite(percent) ||
      percent <= 0 ||
      percent >= 100
    ) {
      return {
        ok: false,
        code: "invalid_percent",
        message: "Скидка в процентах - целое число от 1 до 99",
        field: "percent",
      }
    }
    return { ok: true, value: { mode: "percent", percent: Math.round(percent) } }
  }
  if (b.sale_price !== undefined) {
    const sale = typeof b.sale_price === "string" ? Number(b.sale_price) : b.sale_price
    if (typeof sale !== "number" || !Number.isFinite(sale) || sale <= 0) {
      return {
        ok: false,
        code: "invalid_sale_price",
        message: "Скидочная цена - положительное число в рублях",
        field: "sale_price",
      }
    }
    return { ok: true, value: { mode: "amount", sale_price: Math.round(sale) } }
  }
  return {
    ok: false,
    code: "invalid_body",
    message: "Укажите percent, sale_price или clear",
  }
}

export function resolveSaleAmount(
  input: PromoDiscountInput,
  basePrice: number
): { ok: true; amount: number | null } | { ok: false; code: string; message: string } {
  if (input.mode === "clear") return { ok: true, amount: null }
  const amount =
    input.mode === "percent"
      ? Math.round(basePrice * (1 - input.percent / 100))
      : input.sale_price
  if (!(amount > 0) || amount >= basePrice) {
    return {
      ok: false,
      code: "sale_not_lower",
      message: "Скидочная цена должна быть ниже обычной",
    }
  }
  return { ok: true, amount }
}
