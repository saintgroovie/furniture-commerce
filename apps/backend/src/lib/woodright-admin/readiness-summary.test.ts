import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { summarizeProductReadiness } from "./readiness-summary.ts"

function baseStandard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "prod_1",
    handle: "oliver-krovat",
    title: "Oliver",
    status: "published",
    thumbnail: "/static/products/oliver/ol.jpg",
    metadata: { collection: "oliver" },
    images: [{ url: "/static/products/oliver/ol.jpg" }],
    variants: [
      {
        id: "var_1",
        sku: "OL-23-1",
        prices: [{ id: "price_1", amount: 189000, currency_code: "rub" }],
      },
    ],
    product_classification: { product_type: "STANDARD" },
    ...overrides,
  }
}

describe("summarizeProductReadiness", () => {
  it("marks a published healthy product visible with price and media", () => {
    const summary = summarizeProductReadiness(baseStandard())
    assert.equal(summary.published, true)
    assert.equal(summary.visible, true)
    assert.equal(summary.has_price, true)
    assert.equal(summary.has_media, true)
    assert.equal(summary.codes.includes("draft"), false)
    assert.equal(summary.codes.includes("missing_price"), false)
    assert.equal(summary.codes.includes("missing_media"), false)
    assert.equal(summary.codes.includes("published_invisible"), false)
  })

  it("marks draft as not published and not visible", () => {
    const summary = summarizeProductReadiness(baseStandard({ status: "draft" }))
    assert.equal(summary.published, false)
    assert.equal(summary.visible, false)
    assert.equal(summary.codes.includes("draft"), true)
  })

  it("adds missing_price when a cart product has no RUB amount", () => {
    const summary = summarizeProductReadiness(
      baseStandard({
        variants: [{ id: "var_1", sku: "OL-23-1" }],
      })
    )
    assert.equal(summary.has_price, false)
    assert.equal(summary.codes.includes("missing_price"), true)
  })

  it("does not add missing_price for BESPOKE without a price", () => {
    const summary = summarizeProductReadiness(
      baseStandard({
        product_classification: { product_type: "BESPOKE" },
        variants: [{ id: "var_1", sku: "BES-01" }],
      })
    )
    assert.equal(summary.has_price, false)
    assert.equal(summary.codes.includes("missing_price"), false)
    assert.equal(summary.visible, true)
  })

  it("adds missing_media when thumbnail and gallery are empty", () => {
    const summary = summarizeProductReadiness(
      baseStandard({
        thumbnail: null,
        images: [],
      })
    )
    assert.equal(summary.has_media, false)
    assert.equal(summary.codes.includes("missing_media"), true)
  })

  it("uses existing visibility rules for published but invisible products", () => {
    const summary = summarizeProductReadiness(
      baseStandard({
        metadata: { collection: "princess-rose" },
      })
    )
    assert.equal(summary.published, true)
    assert.equal(summary.visible, false)
    assert.equal(summary.codes.includes("published_invisible"), true)
  })
})
