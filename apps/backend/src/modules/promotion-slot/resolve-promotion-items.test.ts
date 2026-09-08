import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  classifyPromotionCandidate,
  discountPercent,
  resolvePromotionItems,
  type PromotionCandidateProduct,
} from "./resolve-promotion-items.ts"
import type { PromotionSlotRecord } from "./slot-contract.ts"

const NOW = new Date("2026-09-08T12:00:00Z")

function slot(over: Partial<PromotionSlotRecord> = {}): PromotionSlotRecord {
  return {
    id: "slot_1",
    key: "catalog_main",
    enabled: true,
    label: "Специальная цена",
    product_ids: ["p1", "p2"],
    starts_at: null,
    ends_at: null,
    rotation_interval_ms: 7000,
    ...over,
  }
}

function saleProduct(
  id: string,
  over: Partial<PromotionCandidateProduct> = {}
): PromotionCandidateProduct {
  return {
    id,
    status: "published",
    thumbnail: `/static/${id}.jpg`,
    images: [{ url: `/static/${id}.jpg` }],
    product_classification: { product_type: "STANDARD" },
    purchase: { can_purchase: true },
    metadata: {
      buyer_default_configuration: {
        min_unit_price: 68985,
        original_min_unit_price: 76650,
      },
    },
    variants: [
      {
        id: `v_${id}`,
        calculated_price: {
          calculated_amount: 98550,
          original_amount: 109500,
          is_calculated_price_price_list: true,
        },
      },
    ],
    ...over,
  }
}

function map(...products: PromotionCandidateProduct[]) {
  return new Map(products.map((p) => [String(p.id), p]))
}

describe("resolvePromotionItems - slot states", () => {
  it("disabled slot → inactive, no items", () => {
    const r = resolvePromotionItems(slot({ enabled: false }), map(saleProduct("p1")), NOW)
    assert.equal(r.active, false)
    assert.deepEqual(r.items, [])
  })

  it("missing slot → inactive", () => {
    const r = resolvePromotionItems(null, map(saleProduct("p1")), NOW)
    assert.equal(r.active, false)
  })

  it("active slot with two valid products → two items in slot order", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p2", "p1"] }),
      map(saleProduct("p1"), saleProduct("p2")),
      NOW
    )
    assert.equal(r.active, true)
    assert.deepEqual(
      r.items.map((i) => i.product_id),
      ["p2", "p1"]
    )
    assert.equal(r.items[0]!.sale_price, 68985)
    assert.equal(r.items[0]!.original_price, 76650)
    assert.equal(r.items[0]!.discount_percent, 10)
  })

  it("expired slot (ends_at in the past) → inactive", () => {
    const r = resolvePromotionItems(
      slot({ ends_at: "2026-09-01T00:00:00Z" }),
      map(saleProduct("p1")),
      NOW
    )
    assert.equal(r.active, false)
  })

  it("not yet started slot → inactive", () => {
    const r = resolvePromotionItems(
      slot({ starts_at: "2026-10-01T00:00:00Z" }),
      map(saleProduct("p1")),
      NOW
    )
    assert.equal(r.active, false)
  })

  it("slot within window → active", () => {
    const r = resolvePromotionItems(
      slot({ starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-30T00:00:00Z" }),
      map(saleProduct("p1")),
      NOW
    )
    assert.equal(r.active, true)
    assert.equal(r.items.length, 1)
  })

  it("duplicate ids in slot are collapsed", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p1", "p1", "p2"] }),
      map(saleProduct("p1"), saleProduct("p2")),
      NOW
    )
    assert.deepEqual(
      r.items.map((i) => i.product_id),
      ["p1", "p2"]
    )
  })
})

describe("resolvePromotionItems - product skipping", () => {
  it("missing product → skipped not_found, order of remaining preserved", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p1", "ghost", "p2"] }),
      map(saleProduct("p1"), saleProduct("p2")),
      NOW
    )
    assert.deepEqual(
      r.items.map((i) => i.product_id),
      ["p1", "p2"]
    )
    assert.deepEqual(r.skipped, [{ product_id: "ghost", reason: "not_found" }])
  })

  it("unpublished product skipped", () => {
    const r = resolvePromotionItems(
      slot(),
      map(saleProduct("p1", { status: "draft" }), saleProduct("p2")),
      NOW
    )
    assert.deepEqual(r.skipped, [{ product_id: "p1", reason: "unpublished" }])
    assert.equal(r.items.length, 1)
  })

  it("BESPOKE product skipped", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p1"] }),
      map(saleProduct("p1", { product_classification: { product_type: "BESPOKE" } })),
      NOW
    )
    assert.deepEqual(r.skipped, [{ product_id: "p1", reason: "bespoke" }])
  })

  it("not purchasable by sales policy skipped", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p1"] }),
      map(saleProduct("p1", { purchase: { can_purchase: false } })),
      NOW
    )
    assert.deepEqual(r.skipped, [{ product_id: "p1", reason: "not_purchasable" }])
  })

  it("product without active sale price skipped (no original in default config)", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p1"] }),
      map(
        saleProduct("p1", {
          metadata: { buyer_default_configuration: { min_unit_price: 76650 } },
        })
      ),
      NOW
    )
    assert.deepEqual(r.skipped, [{ product_id: "p1", reason: "no_sale_price" }])
  })

  it("calculated price without price list is not a sale", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p1"] }),
      map(
        saleProduct("p1", {
          metadata: {},
          variants: [
            {
              id: "v",
              calculated_price: {
                calculated_amount: 109500,
                original_amount: 109500,
                is_calculated_price_price_list: false,
              },
            },
          ],
        })
      ),
      NOW
    )
    assert.deepEqual(r.skipped, [{ product_id: "p1", reason: "no_sale_price" }])
  })

  it("falls back to variant calculated_price when default config is absent", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p1"] }),
      map(saleProduct("p1", { metadata: {} })),
      NOW
    )
    assert.equal(r.items.length, 1)
    assert.equal(r.items[0]!.sale_price, 98550)
    assert.equal(r.items[0]!.original_price, 109500)
  })

  it("product without image skipped", () => {
    const r = resolvePromotionItems(
      slot({ product_ids: ["p1"] }),
      map(saleProduct("p1", { thumbnail: null, images: [] })),
      NOW
    )
    assert.deepEqual(r.skipped, [{ product_id: "p1", reason: "no_image" }])
  })

  it("all products skipped → active slot, empty items (card hidden)", () => {
    const r = resolvePromotionItems(
      slot(),
      map(saleProduct("p1", { status: "draft" }), saleProduct("p2", { thumbnail: null, images: [] })),
      NOW
    )
    assert.equal(r.active, true)
    assert.deepEqual(r.items, [])
    assert.equal(r.skipped.length, 2)
  })
})

describe("classifyPromotionCandidate / discountPercent", () => {
  it("undefined → not_found", () => {
    assert.deepEqual(classifyPromotionCandidate(undefined), { ok: false, reason: "not_found" })
  })
  it("rounds discount percent", () => {
    assert.equal(discountPercent(109500, 98550), 10)
    assert.equal(discountPercent(45900, 41310), 10)
    assert.equal(discountPercent(1000, 1000), 0)
    assert.equal(discountPercent(1000, 1200), 0)
  })
})
