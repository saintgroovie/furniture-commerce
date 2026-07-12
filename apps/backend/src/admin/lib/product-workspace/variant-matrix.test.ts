import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildBulkPricePreview, applyBulkAmount } from "./bulk-price.ts"
import { buildVariantPricesPayload } from "./price-payload.ts"
import { parseMajorPriceInput, formatMajorMoney, missingVsZeroLabel } from "./price-input.ts"
import { isSimpleCurrencyPrice, variantPriceMutationGate } from "./price-editability.ts"
import { buildVariantMatrix } from "./variant-matrix.ts"
import { filterVariantRows, sortVariantRows } from "./variant-filters.ts"
import type { VariantMatrixRow } from "./variant-matrix-types.ts"

describe("price input", () => {
  it("parses spaced integers and rejects fraction for RUB contract", () => {
    assert.deepEqual(parseMajorPriceInput("12 500"), { ok: true, amount: 12500 })
    assert.equal(parseMajorPriceInput("12,5").ok, false)
    assert.equal(parseMajorPriceInput("-1").ok, false)
    assert.equal(parseMajorPriceInput("").ok, false)
  })

  it("formats money and distinguishes zero vs missing", () => {
    assert.match(formatMajorMoney(12500, "rub"), /12[\s\u00a0]?500/)
    assert.equal(missingVsZeroLabel(null), "missing")
    assert.equal(missingVsZeroLabel(0), "zero")
    assert.equal(missingVsZeroLabel(10), "priced")
  })
})

describe("price editability + payload", () => {
  it("treats empty rules as simple and blocks rule/min prices", () => {
    assert.equal(
      isSimpleCurrencyPrice({
        id: "p1",
        amount: 100,
        currency_code: "rub",
        rules: {},
        min_quantity: null,
        max_quantity: null,
      }),
      true
    )
    assert.equal(
      isSimpleCurrencyPrice({
        id: "p2",
        amount: 100,
        currency_code: "rub",
        rules: { region_id: "reg_1" },
      }),
      false
    )
  })

  it("rebuilds full replacement payload preserving other currencies", () => {
    const existing = [
      { id: "rub1", amount: 100, currency_code: "rub", rules: {} },
      { id: "usd1", amount: 10, currency_code: "usd", rules: {} },
    ]
    const built = buildVariantPricesPayload({
      existing,
      currency_code: "rub",
      amount: 120,
      mode: "update",
    })
    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.prices.length, 2)
    assert.deepEqual(
      built.prices.find((p) => p.currency_code === "usd"),
      { id: "usd1", amount: 10, currency_code: "usd" }
    )
  })

  it("blocks payload when complex price present", () => {
    const built = buildVariantPricesPayload({
      existing: [{ id: "c1", amount: 100, currency_code: "rub", rules: { region_id: "x" } }],
      currency_code: "rub",
      amount: 110,
      mode: "update",
    })
    assert.deepEqual(built, { ok: false, code: "blocked_complex" })
  })
})

describe("variant matrix", () => {
  it("uses compact Default presentation for STANDARD single variant", () => {
    const view = buildVariantMatrix({
      productId: "prod_1",
      classification: {
        code: "STANDARD",
        label: "Готовый",
        warning: null,
        source: "product_classification.product_type",
      },
      options: [{ id: "opt1", title: "Default", values: [{ value: "Default" }] }],
      variants: [
        {
          id: "var1",
          title: "Default",
          sku: "sku-1",
          options: [
            { value: "Default", option_id: "opt1", option: { id: "opt1", title: "Default" } },
          ],
          prices: [{ id: "p1", amount: 12500, currency_code: "rub", rules: {} }],
        },
      ],
      stockAdminPath: (id) => `/app/products/${id}`,
    })
    assert.equal(view.mode, "compact")
    assert.equal(view.rows[0].display_title, "Основной вариант")
  })

  it("builds dynamic option columns and detects duplicate SKU / missing price", () => {
    const view = buildVariantMatrix({
      productId: "prod_2",
      classification: {
        code: "CONFIGURABLE",
        label: "Конфигурируемый",
        warning: null,
        source: "product_classification.product_type",
      },
      options: [
        { id: "opt_color", title: "Цвет", values: [{ value: "Дуб" }, { value: "Орех" }] },
        { id: "opt_size", title: "Размер", values: [{ value: "M" }] },
      ],
      variants: [
        {
          id: "v1",
          title: "Дуб / M",
          sku: "a",
          options: [
            { value: "Дуб", option_id: "opt_color", option: { id: "opt_color", title: "Цвет" } },
            { value: "M", option_id: "opt_size", option: { id: "opt_size", title: "Размер" } },
          ],
          prices: [{ id: "p1", amount: 100, currency_code: "rub", rules: {} }],
        },
        {
          id: "v2",
          title: "Орех / M",
          sku: "a",
          options: [
            { value: "Орех", option_id: "opt_color", option: { id: "opt_color", title: "Цвет" } },
            { value: "M", option_id: "opt_size", option: { id: "opt_size", title: "Размер" } },
          ],
          prices: [],
        },
      ],
      stockAdminPath: (id) => `/app/products/${id}`,
    })
    assert.equal(view.mode, "matrix")
    assert.ok(view.rows[0].issues.some((i) => i.code === "duplicate_sku"))
    assert.ok(view.rows[1].issues.some((i) => i.code === "missing_price"))
  })

  it("shows BESPOKE and missing classification banners", () => {
    const bespoke = buildVariantMatrix({
      productId: "p",
      classification: {
        code: "BESPOKE",
        label: "По запросу",
        warning: "x",
        source: "product_classification.product_type",
      },
      options: [],
      variants: [{ id: "v", title: "Default", sku: null, prices: [] }],
      stockAdminPath: (id) => id,
    })
    assert.match(bespoke.banner ?? "", /по запросу/i)
  })
})

describe("filters sort bulk", () => {
  const rows: VariantMatrixRow[] = [
    {
      variant_id: "1",
      title: "A",
      display_title: "A",
      is_default_only: false,
      sku: "sku-a",
      option_values: { o1: "Дуб" },
      option_label: "Цвет: Дуб",
      prices: [{ id: "p", amount: 100, currency_code: "rub", rules: {} }],
      primary_currency: "rub",
      primary_amount: 100,
      price_status: "ok",
      price_status_label: "100",
      editable_currencies: ["rub"],
      price_edit_blocked_reason: null,
      inventory_hint: null,
      manage_inventory: null,
      issues: [],
    },
    {
      variant_id: "2",
      title: "B",
      display_title: "B",
      is_default_only: false,
      sku: null,
      option_values: { o1: "Орех" },
      option_label: "Цвет: Орех",
      prices: [],
      primary_currency: null,
      primary_amount: null,
      price_status: "missing",
      price_status_label: "Нет цены",
      editable_currencies: [],
      price_edit_blocked_reason: null,
      inventory_hint: null,
      manage_inventory: null,
      issues: [
        {
          level: "attention",
          code: "missing_price",
          field: "price",
          message: "Нет цены.",
          action: "x",
        },
      ],
    },
  ]

  it("filters and bulk percent rounding", () => {
    assert.equal(filterVariantRows(rows, { query: "", filter: "no_price" }).length, 1)
    assert.deepEqual(applyBulkAmount(100, { type: "add_percent", percent: 10, currency_code: "rub" }), {
      ok: true,
      amount: 110,
    })
    const preview = buildBulkPricePreview(rows, { type: "set", amount: 200, currency_code: "rub" })
    assert.equal(preview.will_change_count, 2)
  })
})
