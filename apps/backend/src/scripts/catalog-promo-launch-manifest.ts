/**
 * Catalog Promotion Window - launch manifest (pure, no I/O).
 *
 * Exactly two existing Greenwich products (STANDARD, published, white finish,
 * multi-image galleries). 10% launch discount via the native sale price list
 * "Промо в каталоге". Base prices are pinned so the bootstrap fails closed on
 * any drift instead of silently discounting a different price.
 */
import { createHash } from "node:crypto"

export const CATALOG_PROMO_MANIFEST_ID = "catalog-promo-launch-v1" as const

export const CATALOG_PROMO_LAUNCH_DISCOUNT_PERCENT = 10 as const

export type CatalogPromoLaunchProduct = {
  product_id: string
  handle: string
  title: string
  variant_id: string
  sku: string
  /** Base RUB price expected in `price_set.prices` (no price list). */
  expected_base_price: number
  /** 10% sale price, whole rubles. */
  sale_price: number
}

/** Rotation order = array order. */
export const CATALOG_PROMO_LAUNCH_PRODUCTS: readonly CatalogPromoLaunchProduct[] = [
  {
    product_id: "prod_01KM1QHNHNKSG173KZ6C2AZ5JR",
    handle: "greenwich-gr-05-1",
    title: "Комод",
    variant_id: "variant_01KM1QHQ4MA4A0WS98GQMSPP56",
    sku: "GR-05-1",
    expected_base_price: 109500,
    sale_price: 98550,
  },
  {
    product_id: "prod_01KM1QHNHNR5R4YZKQERDE8EZ6",
    handle: "greenwich-gr-44-1",
    title: "Консоль",
    variant_id: "variant_01KM1QHQ4P4M9M0F7788346ZQ1",
    sku: "GR-44-1",
    expected_base_price: 45900,
    sale_price: 41310,
  },
] as const

export const CATALOG_PROMO_LAUNCH_SLOT = {
  enabled: true,
  label: "Специальная цена",
  rotation_interval_ms: 7000,
} as const

export function computeCatalogPromoManifestSha(): string {
  const payload = JSON.stringify({
    id: CATALOG_PROMO_MANIFEST_ID,
    percent: CATALOG_PROMO_LAUNCH_DISCOUNT_PERCENT,
    products: CATALOG_PROMO_LAUNCH_PRODUCTS,
    slot: CATALOG_PROMO_LAUNCH_SLOT,
  })
  return createHash("sha256").update(payload).digest("hex")
}

/** Pin - update deliberately together with the manifest above. */
export const CATALOG_PROMO_MANIFEST_SHA_EXPECTED =
  "f2177dee696bc6fc64600439e0f77ab896e2c70df4d9578f7b53c0ecf1671f23"

/** Every manifest sale price must equal round(base × 0.9) and be lower than base. */
export function validateCatalogPromoManifest(): { ok: true } | { ok: false; message: string } {
  const seen = new Set<string>()
  for (const p of CATALOG_PROMO_LAUNCH_PRODUCTS) {
    if (seen.has(p.product_id)) {
      return { ok: false, message: `duplicate product ${p.product_id}` }
    }
    seen.add(p.product_id)
    const expected = Math.round(
      p.expected_base_price * (1 - CATALOG_PROMO_LAUNCH_DISCOUNT_PERCENT / 100)
    )
    if (p.sale_price !== expected) {
      return {
        ok: false,
        message: `${p.sku}: sale_price ${p.sale_price} != ${expected} (${CATALOG_PROMO_LAUNCH_DISCOUNT_PERCENT}% of ${p.expected_base_price})`,
      }
    }
    if (!(p.sale_price < p.expected_base_price)) {
      return { ok: false, message: `${p.sku}: sale price not lower than base` }
    }
  }
  if (CATALOG_PROMO_LAUNCH_PRODUCTS.length !== 2) {
    return { ok: false, message: "launch manifest must list exactly 2 products" }
  }
  return { ok: true }
}
