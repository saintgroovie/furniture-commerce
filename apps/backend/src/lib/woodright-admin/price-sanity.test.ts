import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  assessPriceSave,
  formatRubAmount,
  parseSellerPriceInput,
  pickPrimaryRubPrice,
  PRICE_SANITY_MAX,
  productHasRubPrice,
} from "./price-sanity.ts"

describe("parseSellerPriceInput", () => {
  it("accepts a normal major-unit price", () => {
    const parsed = parseSellerPriceInput("189000")
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.equal(parsed.amount, 189000)
  })

  it("accepts grouped spaces", () => {
    const parsed = parseSellerPriceInput("189 000")
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.equal(parsed.amount, 189000)
  })

  it("accepts nbsp grouping", () => {
    const parsed = parseSellerPriceInput("189\u00a0000")
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.equal(parsed.amount, 189000)
  })

  it("rejects empty", () => {
    const parsed = parseSellerPriceInput("  ")
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "empty")
  })

  it("rejects zero", () => {
    const parsed = parseSellerPriceInput("0")
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "not_positive")
  })

  it("rejects negative", () => {
    const parsed = parseSellerPriceInput("-10")
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "not_positive")
  })

  it("rejects malformed decimals", () => {
    const parsed = parseSellerPriceInput("189000.5")
    assert.equal(parsed.ok, false)
    if (!parsed.ok) {
      assert.equal(parsed.code, "not_integer")
      assert.equal(parsed.message, "Укажите цену без копеек")
    }
  })
})

describe("assessPriceSave", () => {
  it("saves a normal in-range price", () => {
    const result = assessPriceSave(189000, 179000)
    assert.equal(result.decision, "save")
  })

  it("does not confirm at exact ×3 boundary", () => {
    const result = assessPriceSave(3000, 1000)
    assert.equal(result.decision, "save")
  })

  it("confirms when new > old × 3", () => {
    const result = assessPriceSave(3001, 1000)
    assert.equal(result.decision, "confirm")
    if (result.decision === "confirm") {
      assert.equal(result.amount, 3001)
      assert.equal(result.previous, 1000)
    }
  })

  it("confirms when new < old ÷ 3", () => {
    const result = assessPriceSave(50000, 189000)
    assert.equal(result.decision, "confirm")
  })

  it("rejects a likely ×100 typo from a sane previous price", () => {
    const result = assessPriceSave(18_900_000, 189000)
    assert.equal(result.decision, "reject")
  })

  it("allows editing an existing outlier without blocking", () => {
    const result = assessPriceSave(PRICE_SANITY_MAX + 50, PRICE_SANITY_MAX + 100)
    assert.equal(result.decision, "save")
    if (result.decision === "save") {
      assert.ok(result.range_warning)
    }
  })
})

describe("formatRubAmount", () => {
  it("formats with grouping and nbsp before the ruble sign", () => {
    const formatted = formatRubAmount(189000)
    assert.match(formatted, /189/)
    assert.match(formatted, /000/)
    assert.ok(formatted.includes("\u00a0₽"))
    assert.equal(formatted.includes("×"), false)
  })
})

describe("productHasRubPrice", () => {
  it("detects a rub amount on a variant", () => {
    assert.equal(
      productHasRubPrice({
        variants: [{ prices: [{ amount: 189000, currency_code: "rub" }] }],
      }),
      true
    )
  })

  it("is false without amounts", () => {
    assert.equal(productHasRubPrice({ variants: [{ sku: "OL-01-1" }] }), false)
  })
})

describe("pickPrimaryRubPrice", () => {
  it("maps the first RUB price of the given variant only", () => {
    const first = pickPrimaryRubPrice({
      id: "var_a",
      prices: [
        { id: "price_a", amount: 189000, currency_code: "rub" },
        { id: "price_b", amount: 210000, currency_code: "rub" },
      ],
    })
    const second = pickPrimaryRubPrice({
      id: "var_b",
      price_set: {
        prices: [{ id: "price_c", amount: 45000, currency_code: "rub" }],
      },
    })
    assert.deepEqual(first, { id: "price_a", amount: 189000, currency_code: "rub" })
    assert.deepEqual(second, { id: "price_c", amount: 45000, currency_code: "rub" })
  })
})
