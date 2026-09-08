import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  attachStoreCalculatedPrices,
  isStoreSalePrice,
  loadStoreCalculatedPrices,
  resetStorePricingContextCache,
  resolveStorePricingContext,
  slimStoreCalculatedPrice,
} from "./store-calculated-price.ts"
import { resolveDefaultBuyerConfiguration } from "../default-buyer-configuration.ts"

const rawSale = {
  calculated_amount: 98550,
  original_amount: 109500,
  currency_code: "RUB",
  is_calculated_price_price_list: true,
  calculated_price: { price_list_id: "plist_1", price_list_type: "sale" },
}

describe("slimStoreCalculatedPrice / isStoreSalePrice", () => {
  it("slims a sale payload", () => {
    const slim = slimStoreCalculatedPrice(rawSale)
    assert.deepEqual(slim, {
      calculated_amount: 98550,
      original_amount: 109500,
      currency_code: "rub",
      is_calculated_price_price_list: true,
      price_list_type: "sale",
      price_list_id: "plist_1",
    })
    assert.equal(isStoreSalePrice(slim), true)
  })

  it("base-only payload is not a sale", () => {
    const slim = slimStoreCalculatedPrice({
      calculated_amount: 109500,
      original_amount: 109500,
      is_calculated_price_price_list: false,
    })
    assert.equal(isStoreSalePrice(slim), false)
  })

  it("price list that is not lower is not a sale", () => {
    const slim = slimStoreCalculatedPrice({
      ...rawSale,
      calculated_amount: 120000,
      original_amount: 109500,
    })
    assert.equal(isStoreSalePrice(slim), false)
  })

  it("null / missing amount → null", () => {
    assert.equal(slimStoreCalculatedPrice(null), null)
    assert.equal(slimStoreCalculatedPrice({ original_amount: 1 }), null)
  })
})

function fakeQuery(regions: unknown[], variants: unknown[]) {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    graph: async (args: Record<string, unknown>) => {
      calls.push(args)
      if (args.entity === "region") return { data: regions }
      if (args.entity === "product_variant") return { data: variants }
      return { data: [] }
    },
  }
}

describe("resolveStorePricingContext", () => {
  it("first region by created_at, cached", async () => {
    resetStorePricingContextCache()
    const q = fakeQuery(
      [
        { id: "reg_new", currency_code: "EUR", created_at: "2026-02-01T00:00:00Z" },
        { id: "reg_ru", currency_code: "RUB", created_at: "2026-01-01T00:00:00Z" },
      ],
      []
    )
    const ctx = await resolveStorePricingContext(q)
    assert.deepEqual(ctx, { region_id: "reg_ru", currency_code: "rub" })
    await resolveStorePricingContext(q)
    assert.equal(q.calls.length, 1)
    resetStorePricingContextCache()
  })

  it("no regions → null (and cached)", async () => {
    resetStorePricingContextCache()
    const q = fakeQuery([], [])
    assert.equal(await resolveStorePricingContext(q), null)
    resetStorePricingContextCache()
  })
})

describe("attachStoreCalculatedPrices", () => {
  it("attaches slim calculated price per variant, leaves others untouched", async () => {
    resetStorePricingContextCache()
    const q = fakeQuery(
      [{ id: "reg_ru", currency_code: "rub", created_at: "2026-01-01T00:00:00Z" }],
      [
        { id: "v1", calculated_price: rawSale },
        { id: "v2", calculated_price: null },
      ]
    )
    const out = await attachStoreCalculatedPrices(q, [
      { id: "p", variants: [{ id: "v1", prices: [{ amount: 109500 }] }, { id: "v2" }] },
    ])
    const variants = out[0]!.variants as Array<Record<string, unknown>>
    assert.equal((variants[0]!.calculated_price as { calculated_amount: number }).calculated_amount, 98550)
    assert.deepEqual(variants[0]!.prices, [{ amount: 109500 }])
    assert.equal(variants[1]!.calculated_price, undefined)
    const variantCall = q.calls.find((c) => c.entity === "product_variant")!
    assert.deepEqual(variantCall.filters, { id: ["v1", "v2"] })
    assert.ok(variantCall.context)
    resetStorePricingContextCache()
  })

  it("no variants → no query", async () => {
    resetStorePricingContextCache()
    const q = fakeQuery([], [])
    const products = [{ id: "p", variants: [] }]
    assert.equal(await attachStoreCalculatedPrices(q, products), products)
    assert.equal(q.calls.length, 0)
  })

  it("loadStoreCalculatedPrices with empty ids → empty map, no query", async () => {
    const q = fakeQuery([], [])
    assert.equal((await loadStoreCalculatedPrices(q, [])).size, 0)
    assert.equal(q.calls.length, 0)
  })
})

describe("resolveDefaultBuyerConfiguration - original_min_unit_price", () => {
  const tiers = {
    solid_front_ldsp_body: { key: "solid_front_ldsp_body", label_ru: "ЛДСП", description_ru: "", price_multiplier: 0.7, position: 0 },
    solid_full: { key: "solid_full", label_ru: "Массив", description_ru: "", price_multiplier: 1, position: 1 },
  }

  it("sale + tiers → both prices through the same multiplier", () => {
    const cfg = resolveDefaultBuyerConfiguration({
      metadata: { material_tiers: tiers },
      variants: [{ id: "v1", prices: [{ amount: 109500 }], calculated_price: rawSale }],
    })
    assert.equal(cfg?.min_unit_price, 68985)
    assert.equal(cfg?.original_min_unit_price, 76650)
  })

  it("sale without tiers → raw amounts", () => {
    const cfg = resolveDefaultBuyerConfiguration({
      metadata: {},
      variants: [{ id: "v1", prices: [{ amount: 109500 }], calculated_price: rawSale }],
    })
    assert.equal(cfg?.min_unit_price, 98550)
    assert.equal(cfg?.original_min_unit_price, 109500)
  })

  it("no sale → original_min_unit_price absent", () => {
    const cfg = resolveDefaultBuyerConfiguration({
      metadata: { material_tiers: tiers },
      variants: [
        {
          id: "v1",
          prices: [{ amount: 109500 }],
          calculated_price: {
            calculated_amount: 109500,
            original_amount: 109500,
            is_calculated_price_price_list: false,
          },
        },
      ],
    })
    assert.equal(cfg?.min_unit_price, 76650)
    assert.equal("original_min_unit_price" in (cfg ?? {}), false)
  })

  it("legacy payload without calculated_price still works", () => {
    const cfg = resolveDefaultBuyerConfiguration({
      metadata: {},
      variants: [{ id: "v1", prices: [{ amount: 45900 }] }],
    })
    assert.equal(cfg?.min_unit_price, 45900)
    assert.equal(cfg?.original_min_unit_price, undefined)
  })
})
