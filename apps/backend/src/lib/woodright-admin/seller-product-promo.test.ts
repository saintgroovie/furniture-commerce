import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { attachPromoPrices } from "./seller-product-promo"
import type { SellerProduct } from "./seller-product-types"
import { listCatalogPromoPrices, type PricingModulePort } from "./catalog-promo-price-list"
import { toSellerProduct } from "./seller-product"

const base = {
  id: "prod_1",
  variants: [
    { id: "v1", sku: "A-1", title: null, rub_price: { id: "p1", amount: 82000 }, promo_price: null, price_set_id: "pset_1" },
    { id: "v2", sku: "A-2", title: null, rub_price: { id: "p2", amount: 91000 }, promo_price: null, price_set_id: "pset_2" },
  ],
} as unknown as SellerProduct

describe("attachPromoPrices", () => {
  it("attaches the canonical promo row by price set and leaves the base untouched", () => {
    const rows = new Map([["pset_1", { id: "sale_1", amount: 70000, currency_code: "rub", price_set_id: "pset_1", price_list_id: "plist_1" }]])
    const out = attachPromoPrices(base, rows, "plist_1")
    assert.deepEqual(out.variants[0]!.promo_price, { amount: 70000, price_list_id: "plist_1" })
    assert.equal(out.variants[0]!.rub_price?.amount, 82000)
    assert.equal(out.variants[1]!.promo_price, null)
    assert.equal(base.variants[0]!.promo_price, null)
  })
  it("ignores non-positive or missing rows", () => {
    const rows = new Map([["pset_1", { id: "sale_1", amount: 0, currency_code: "rub", price_set_id: "pset_1", price_list_id: "plist_1" }]])
    const out = attachPromoPrices(base, rows, "plist_1")
    assert.equal(out.variants[0]!.promo_price, null)
  })
  it("graph without price-list rows + canonical pricing rows → promo_price for the matching set only", async () => {
    const graph = toSellerProduct(
      {
        id: "prod_cfg",
        handle: "cfg",
        title: "Конфигуратор",
        status: "published",
        variants: [
          { id: "v1", sku: "IT-CFG-01", price_set: { id: "pset_1", prices: [{ id: "p1", amount: 82000, currency_code: "rub", price_list_id: null }] } },
          { id: "v2", sku: "IT-CFG-02", price_set: { id: "pset_2", prices: [{ id: "p2", amount: 91000, currency_code: "rub", price_list_id: null }] } },
        ],
      },
      { promoPriceListId: "plist_canon" }
    )
    assert.equal(graph.variants[0]!.promo_price, null)
    assert.equal(graph.variants[0]!.price_set_id, "pset_1")

    const seen: Array<Record<string, unknown>> = []
    const pricing = {
      listPrices: async (filters?: Record<string, unknown>) => {
        seen.push(filters ?? {})
        return [
          { id: "sale_1", amount: "70000", currency_code: "rub", price_set_id: "pset_1", price_list_id: "plist_canon" },
        ]
      },
    } as unknown as PricingModulePort
    const rows = await listCatalogPromoPrices(pricing, "plist_canon", ["pset_1", "pset_2"])
    assert.deepEqual(seen[0], { price_list_id: ["plist_canon"], currency_code: "rub", price_set_id: ["pset_1", "pset_2"] })

    const out = attachPromoPrices(graph, rows, "plist_canon")
    assert.deepEqual(out.variants[0]!.promo_price, { amount: 70000, price_list_id: "plist_canon" })
    assert.equal(out.variants[1]!.promo_price, null)
    assert.equal(out.variants[0]!.rub_price?.amount, 82000)
  })
  it("empty map (no canonical list / no rows) keeps promo_price null without touching base", () => {
    const out = attachPromoPrices(base, new Map(), "plist_1")
    assert.deepEqual(out.variants.map((v) => v.promo_price), [null, null])
    assert.equal(out.variants[1]!.rub_price?.amount, 91000)
  })
})
