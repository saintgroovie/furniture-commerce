import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CATALOG_PROMO_PRICE_LIST_TITLE,
  CatalogPromoPriceListConflictError,
  ensureCatalogPromoPriceList,
  findCatalogPromoPriceList,
  upsertCatalogPromoPrice,
  removeCatalogPromoPrice,
  type PriceListRow,
  type PriceRow,
  type PricingModulePort,
} from "./catalog-promo-price-list.ts"

/** In-memory pricing port: price lists + list prices, with optional race hook. */
function fakePricing(initialLists: PriceListRow[] = [], opts: { onCreate?: () => void } = {}) {
  const lists: PriceListRow[] = [...initialLists]
  const prices: PriceRow[] = []
  let seq = 0
  const calls: string[] = []
  const port: PricingModulePort = {
    async listPriceLists(filters) {
      calls.push("listPriceLists")
      const title = (filters as { title?: string } | undefined)?.title
      return lists.filter((l) => !title || l.title === title)
    },
    async createPriceLists(data) {
      calls.push("createPriceLists")
      opts.onCreate?.()
      const out: PriceListRow[] = []
      for (const d of data) {
        const row: PriceListRow = {
          id: `plist_${++seq}`,
          title: d.title as string,
          type: d.type as string,
          status: d.status as string,
          created_at: new Date(2026, 8, 8, 12, 0, seq),
        }
        lists.push(row)
        out.push(row)
      }
      return out
    },
    async updatePriceLists() {
      calls.push("updatePriceLists")
      return []
    },
    async listPrices(filters) {
      calls.push("listPrices")
      const f = filters as { price_list_id?: string[]; price_set_id?: string[] }
      return prices.filter(
        (p) =>
          (!f.price_list_id || f.price_list_id.includes(p.price_list_id ?? "")) &&
          (!f.price_set_id || f.price_set_id.includes(p.price_set_id ?? ""))
      )
    },
    async addPriceListPrices(data) {
      calls.push("addPriceListPrices")
      for (const d of data) {
        for (const p of d.prices) {
          prices.push({
            id: `price_${++seq}`,
            price_list_id: d.price_list_id,
            price_set_id: p.price_set_id as string,
            currency_code: p.currency_code as string,
            amount: p.amount as number,
          })
        }
      }
    },
    async updatePriceListPrices(data) {
      calls.push("updatePriceListPrices")
      for (const d of data) {
        for (const p of d.prices) {
          const row = prices.find((x) => x.id === p.id)
          if (row) row.amount = p.amount as number
        }
      }
    },
    async removePrices(ids) {
      calls.push("removePrices")
      for (const id of ids) {
        const i = prices.findIndex((p) => p.id === id)
        if (i >= 0) prices.splice(i, 1)
      }
    },
    async deletePriceLists(ids) {
      calls.push("deletePriceLists")
      for (const id of ids) {
        const i = lists.findIndex((l) => l.id === id)
        if (i >= 0) lists.splice(i, 1)
      }
    },
  }
  return { port, lists, prices, calls }
}

describe("findCatalogPromoPriceList", () => {
  it("returns null when nothing matches", async () => {
    const { port } = fakePricing()
    assert.equal(await findCatalogPromoPriceList(port), null)
  })

  it("accepts only sale lists and picks the oldest deterministically", async () => {
    const { port } = fakePricing([
      { id: "b", title: CATALOG_PROMO_PRICE_LIST_TITLE, type: "sale", created_at: "2026-09-02T00:00:00Z" },
      { id: "a", title: CATALOG_PROMO_PRICE_LIST_TITLE, type: "sale", created_at: "2026-09-01T00:00:00Z" },
      { id: "o", title: CATALOG_PROMO_PRICE_LIST_TITLE, type: "override", created_at: "2026-08-01T00:00:00Z" },
    ])
    const found = await findCatalogPromoPriceList(port)
    assert.equal(found?.id, "a")
  })

  it("fails closed on a same-title non-sale list", async () => {
    const { port } = fakePricing([
      { id: "o", title: CATALOG_PROMO_PRICE_LIST_TITLE, type: "override" },
    ])
    await assert.rejects(
      () => findCatalogPromoPriceList(port),
      (e: unknown) =>
        e instanceof CatalogPromoPriceListConflictError &&
        e.priceListId === "o" &&
        e.code === "catalog_promo_price_list_conflict"
    )
  })
})

describe("ensureCatalogPromoPriceList", () => {
  it("creates once, then reuses", async () => {
    const { port, lists } = fakePricing()
    const first = await ensureCatalogPromoPriceList(port)
    assert.equal(first.created, true)
    assert.equal(first.priceList.type, "sale")
    const second = await ensureCatalogPromoPriceList(port)
    assert.equal(second.created, false)
    assert.equal(second.priceList.id, first.priceList.id)
    assert.equal(lists.length, 1)
  })

  it("recovers from a concurrent create: adopts the oldest and deletes its duplicate", async () => {
    // Simulate another caller inserting the canonical list between our
    // find (empty) and our create.
    const state = fakePricing()
    state.port.createPriceLists = (async (data) => {
      state.lists.push({
        id: "plist_other",
        title: CATALOG_PROMO_PRICE_LIST_TITLE,
        type: "sale",
        created_at: "2026-09-08T11:59:00Z",
      })
      const mine: PriceListRow = {
        id: "plist_mine",
        title: data[0].title as string,
        type: "sale",
        created_at: "2026-09-08T12:00:00Z",
      }
      state.lists.push(mine)
      return [mine]
    }) as PricingModulePort["createPriceLists"]
    const result = await ensureCatalogPromoPriceList(state.port)
    assert.equal(result.created, false)
    assert.equal(result.priceList.id, "plist_other")
    assert.deepEqual(state.lists.map((l) => l.id), ["plist_other"])
    assert.ok(state.calls.includes("deletePriceLists"))
  })
})

describe("upsertCatalogPromoPrice / removeCatalogPromoPrice", () => {
  it("creates, updates, no-ops on same amount, removes", async () => {
    const { port, prices } = fakePricing()
    const { priceList } = await ensureCatalogPromoPriceList(port)
    const c = await upsertCatalogPromoPrice(port, priceList.id, "pset_1", 98_550)
    assert.equal(c.action, "created")
    assert.equal(prices.length, 1)
    const u = await upsertCatalogPromoPrice(port, priceList.id, "pset_1", 90_000)
    assert.equal(u.action, "updated")
    assert.equal(u.previous_amount, 98_550)
    assert.equal(prices.length, 1)
    const n = await upsertCatalogPromoPrice(port, priceList.id, "pset_1", 90_000)
    assert.equal(n.action, "unchanged")
    const r = await removeCatalogPromoPrice(port, priceList.id, "pset_1")
    assert.equal(r.removed, true)
    assert.equal(prices.length, 0)
    const r2 = await removeCatalogPromoPrice(port, priceList.id, "pset_1")
    assert.equal(r2.removed, false)
  })
})
