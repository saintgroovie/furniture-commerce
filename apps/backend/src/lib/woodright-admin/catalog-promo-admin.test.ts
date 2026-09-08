import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildCatalogPromoAdminProduct,
  parsePromoDiscountBody,
  resolveSaleAmount,
} from "./catalog-promo-admin.ts"
import {
  isPriceListActiveNow,
  saleAmountForPercent,
  type PriceListRow,
  type PriceRow,
} from "./catalog-promo-price-list.ts"

const NOW = new Date("2026-09-08T12:00:00Z")

const activeList: PriceListRow = {
  id: "plist_1",
  title: "Промо в каталоге",
  status: "active",
  type: "sale",
  starts_at: null,
  ends_at: null,
}

function rawProduct(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "prod_1",
    handle: "greenwich-gr-05-1",
    title: "Комод",
    status: "published",
    thumbnail: "/static/x.jpg",
    images: [{ url: "/static/x.jpg" }],
    metadata: {
      material_tiers: {
        solid_front_ldsp_body: { key: "solid_front_ldsp_body", label_ru: "ЛДСП", description_ru: "", price_multiplier: 0.7, position: 0 },
        solid_full: { key: "solid_full", label_ru: "Массив", description_ru: "", price_multiplier: 1, position: 1 },
      },
    },
    product_classification: { product_type: "STANDARD" },
    variants: [
      {
        id: "variant_1",
        sku: "GR-05-1",
        price_set: {
          id: "pset_1",
          prices: [{ id: "price_base", amount: 109500, currency_code: "rub", price_list_id: null }],
        },
      },
    ],
    ...over,
  }
}

describe("buildCatalogPromoAdminProduct", () => {
  it("eligible product with sale price", () => {
    const promo = new Map<string, PriceRow>([
      ["pset_1", { id: "price_sale", amount: 98550, price_set_id: "pset_1" }],
    ])
    const row = buildCatalogPromoAdminProduct(rawProduct(), promo, activeList, NOW)
    assert.equal(row.base_price, 109500)
    assert.equal(row.sale_price, 98550)
    assert.equal(row.sale_price_id, "price_sale")
    assert.equal(row.discount_percent, 10)
    assert.equal(row.buyer_base_price, 76650)
    assert.equal(row.buyer_sale_price, 68985)
    assert.equal(row.blocker, null)
    assert.equal(row.price_set_id, "pset_1")
  })

  it("no sale price → blocker no_sale_price", () => {
    const row = buildCatalogPromoAdminProduct(rawProduct(), new Map(), activeList, NOW)
    assert.equal(row.sale_price, null)
    assert.equal(row.blocker, "no_sale_price")
  })

  it("base price ignores price-list rows", () => {
    const raw = rawProduct({
      variants: [
        {
          id: "variant_1",
          sku: "GR-05-1",
          price_set: {
            id: "pset_1",
            prices: [
              { id: "price_sale", amount: 98550, currency_code: "rub", price_list_id: "plist_1" },
              { id: "price_base", amount: 109500, currency_code: "rub", price_list_id: null },
            ],
          },
        },
      ],
    })
    const row = buildCatalogPromoAdminProduct(raw, new Map(), activeList, NOW)
    assert.equal(row.base_price, 109500)
  })

  it("blockers: unpublished, bespoke, sale_not_lower, inactive list, no image", () => {
    const promo = new Map<string, PriceRow>([
      ["pset_1", { id: "price_sale", amount: 98550, price_set_id: "pset_1" }],
    ])
    assert.equal(
      buildCatalogPromoAdminProduct(rawProduct({ status: "draft" }), promo, activeList, NOW).blocker,
      "unpublished"
    )
    assert.equal(
      buildCatalogPromoAdminProduct(
        rawProduct({ product_classification: { product_type: "BESPOKE" } }),
        promo,
        activeList,
        NOW
      ).blocker,
      "bespoke"
    )
    const higher = new Map<string, PriceRow>([
      ["pset_1", { id: "price_sale", amount: 120000, price_set_id: "pset_1" }],
    ])
    assert.equal(
      buildCatalogPromoAdminProduct(rawProduct(), higher, activeList, NOW).blocker,
      "sale_not_lower"
    )
    assert.equal(
      buildCatalogPromoAdminProduct(
        rawProduct(),
        promo,
        { ...activeList, ends_at: "2026-09-01T00:00:00Z" },
        NOW
      ).blocker,
      "price_list_inactive"
    )
    assert.equal(
      buildCatalogPromoAdminProduct(rawProduct({ thumbnail: null, images: [] }), promo, activeList, NOW)
        .blocker,
      "no_image"
    )
  })
})

describe("parsePromoDiscountBody / resolveSaleAmount", () => {
  it("percent", () => {
    const p = parsePromoDiscountBody({ percent: 10 })
    assert.equal(p.ok, true)
    if (p.ok) {
      const r = resolveSaleAmount(p.value, 109500)
      assert.deepEqual(r, { ok: true, amount: 98550 })
    }
  })
  it("sale_price", () => {
    const p = parsePromoDiscountBody({ sale_price: "99000" })
    assert.equal(p.ok, true)
    if (p.ok) assert.deepEqual(resolveSaleAmount(p.value, 109500), { ok: true, amount: 99000 })
  })
  it("clear", () => {
    const p = parsePromoDiscountBody({ clear: true })
    assert.equal(p.ok, true)
    if (p.ok) assert.deepEqual(resolveSaleAmount(p.value, 109500), { ok: true, amount: null })
  })
  it("rejects invalid percent / sale not lower / empty", () => {
    assert.equal(parsePromoDiscountBody({ percent: 0 }).ok, false)
    assert.equal(parsePromoDiscountBody({ percent: 100 }).ok, false)
    assert.equal(parsePromoDiscountBody({}).ok, false)
    const p = parsePromoDiscountBody({ sale_price: 109500 })
    assert.equal(p.ok, true)
    if (p.ok) {
      const r = resolveSaleAmount(p.value, 109500)
      assert.equal(r.ok, false)
      if (!r.ok) assert.equal(r.code, "sale_not_lower")
    }
  })
})

describe("price list helpers", () => {
  it("saleAmountForPercent", () => {
    assert.equal(saleAmountForPercent(109500, 10), 98550)
    assert.equal(saleAmountForPercent(45900, 10), 41310)
    assert.equal(saleAmountForPercent(100, 100), null)
    assert.equal(saleAmountForPercent(0, 10), null)
  })
  it("isPriceListActiveNow", () => {
    assert.equal(isPriceListActiveNow(activeList, NOW), true)
    assert.equal(isPriceListActiveNow({ ...activeList, status: "draft" }, NOW), false)
    assert.equal(isPriceListActiveNow({ ...activeList, starts_at: "2026-10-01T00:00:00Z" }, NOW), false)
    assert.equal(isPriceListActiveNow(null, NOW), false)
  })
})
