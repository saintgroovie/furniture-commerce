import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatFixedAmount,
  formatPercent,
  parseFixedAmountInput,
  parsePercentInput,
} from "./amount.ts"

describe("parseFixedAmountInput", () => {
  it("parses plain major units", () => {
    assert.deepEqual(parseFixedAmountInput("3000"), { ok: true, amount: 3000 })
  })

  it("parses grouped input with regular and nbsp spaces", () => {
    assert.deepEqual(parseFixedAmountInput("12 500"), { ok: true, amount: 12500 })
    assert.deepEqual(parseFixedAmountInput("12\u00a0500"), { ok: true, amount: 12500 })
  })

  it("distinguishes empty from zero", () => {
    assert.deepEqual(parseFixedAmountInput(""), { ok: false, code: "empty" })
    assert.deepEqual(parseFixedAmountInput("   "), { ok: false, code: "empty" })
    assert.deepEqual(parseFixedAmountInput("0"), { ok: false, code: "zero" })
  })

  it("rejects negative and fractional amounts", () => {
    assert.deepEqual(parseFixedAmountInput("-100"), { ok: false, code: "negative" })
    assert.deepEqual(parseFixedAmountInput("99.5"), {
      ok: false,
      code: "fraction_not_allowed",
    })
    assert.deepEqual(parseFixedAmountInput("99,5"), {
      ok: false,
      code: "fraction_not_allowed",
    })
  })

  it("rejects garbage", () => {
    assert.deepEqual(parseFixedAmountInput("сто"), { ok: false, code: "invalid" })
    assert.deepEqual(parseFixedAmountInput("10р"), { ok: false, code: "invalid" })
  })
})

describe("parsePercentInput", () => {
  it("accepts 0 < n <= 100 with fractions", () => {
    assert.deepEqual(parsePercentInput("10"), { ok: true, amount: 10 })
    assert.deepEqual(parsePercentInput("12.5"), { ok: true, amount: 12.5 })
    assert.deepEqual(parsePercentInput("12,5"), { ok: true, amount: 12.5 })
    assert.deepEqual(parsePercentInput("100"), { ok: true, amount: 100 })
  })

  it("strips a trailing percent sign", () => {
    assert.deepEqual(parsePercentInput("15%"), { ok: true, amount: 15 })
  })

  it("distinguishes empty from zero", () => {
    assert.deepEqual(parsePercentInput(""), { ok: false, code: "empty" })
    assert.deepEqual(parsePercentInput("0"), { ok: false, code: "zero" })
  })

  it("rejects out-of-range and negative values", () => {
    assert.deepEqual(parsePercentInput("100.1"), { ok: false, code: "out_of_range" })
    assert.deepEqual(parsePercentInput("150"), { ok: false, code: "out_of_range" })
    assert.deepEqual(parsePercentInput("-5"), { ok: false, code: "negative" })
  })

  it("rejects garbage", () => {
    assert.deepEqual(parsePercentInput("десять"), { ok: false, code: "invalid" })
  })
})

describe("formatters", () => {
  it("formats fixed RUB in major units", () => {
    const out = formatFixedAmount(3000, "rub")
    assert.match(out, /3/)
    assert.match(out, /000/)
    assert.match(out, /₽|RUB/)
  })

  it("falls back for unknown currencies", () => {
    assert.equal(formatFixedAmount(10, "??!"), "10 ??!")
  })

  it("formats percents with Russian decimal comma", () => {
    assert.equal(formatPercent(10), "10%")
    assert.equal(formatPercent(12.5), "12,5%")
  })
})
