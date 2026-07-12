import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildPromotionSummary } from "./summary.ts"

describe("buildPromotionSummary", () => {
  it("summarizes a percentage code promotion on selected products", () => {
    const vm = buildPromotionSummary({
      id: "promo_1",
      code: "SUMMER10",
      is_automatic: false,
      type: "standard",
      application_method: {
        type: "percentage",
        value: 10,
        target_type: "items",
        allocation: "across",
        target_rules: [
          { attribute: "items.product.id", operator: "in", values: ["prod_1", "prod_2"] },
        ],
      },
    })
    assert.equal(vm.supported, true)
    assert.equal(vm.text, "Скидка 10% на выбранные товары, по коду SUMMER10")
  })

  it("never leaks raw target_type or attribute paths into primary text", () => {
    const vm = buildPromotionSummary({
      id: "promo_1",
      code: "X",
      type: "standard",
      application_method: {
        type: "percentage",
        value: 15,
        target_type: "items",
        target_rules: [
          { attribute: "items.product.collection_id", operator: "in", values: ["col_1"] },
        ],
      },
    })
    assert.ok(!/target_type|allocation|items\.product/i.test(vm.text))
    assert.match(vm.text, /коллекц/i)
  })

  it("summarizes an automatic order-level percentage", () => {
    const vm = buildPromotionSummary({
      id: "promo_2",
      code: "AUTO5",
      is_automatic: true,
      type: "standard",
      application_method: { type: "percentage", value: 5, target_type: "order" },
    })
    assert.equal(vm.text, "Скидка 5% на весь заказ, применяется автоматически")
  })

  it("summarizes fixed RUB with the base-price honesty note", () => {
    const vm = buildPromotionSummary({
      id: "promo_3",
      code: "MINUS3000",
      type: "standard",
      application_method: {
        type: "fixed",
        value: 3000,
        currency_code: "rub",
        target_type: "order",
      },
    })
    assert.match(vm.text, /по коду MINUS3000/)
    assert.ok(vm.notes.some((n) => /не меняет базовые цены/.test(n)))
  })

  it("mentions exclusions", () => {
    const vm = buildPromotionSummary({
      id: "promo_4",
      code: "NOTALL",
      type: "standard",
      application_method: {
        type: "percentage",
        value: 20,
        target_type: "items",
        target_rules: [
          { attribute: "items.product.collection_id", operator: "in", values: ["col_1"] },
          { attribute: "items.product.id", operator: "ne", values: ["prod_9"] },
        ],
      },
    })
    assert.match(vm.text, /с исключениями/)
  })

  it("routes buyget to stock Admin fallback", () => {
    const vm = buildPromotionSummary({ id: "promo_5", type: "buyget", code: "BG" })
    assert.equal(vm.supported, false)
    assert.match(vm.text, /разделе акций/)
    assert.ok(vm.fallback_reason)
  })

  it("routes free-shipping approximation to stock Admin fallback", () => {
    const vm = buildPromotionSummary({
      id: "promo_6",
      code: "FREESHIP",
      type: "standard",
      application_method: {
        type: "percentage",
        value: 100,
        target_type: "shipping_methods",
        allocation: "each",
        max_quantity: 1,
      },
    })
    assert.equal(vm.supported, false)
    assert.match(vm.text, /Бесплатная доставка/)
  })

  it("fails closed on unknown application method", () => {
    const vm = buildPromotionSummary({
      id: "promo_7",
      code: "WEIRD",
      type: "standard",
      application_method: { type: "tiered", value: 10 },
    })
    assert.equal(vm.supported, false)
    assert.match(vm.text, /разделе акций/)
  })

  it("fails closed on unsupported target rules", () => {
    const vm = buildPromotionSummary({
      id: "promo_8",
      code: "VAR",
      type: "standard",
      application_method: {
        type: "percentage",
        value: 10,
        target_type: "items",
        target_rules: [{ attribute: "items.variant.id", operator: "in", values: ["v_1"] }],
      },
    })
    assert.equal(vm.supported, false)
    assert.match(vm.fallback_reason ?? "", /вариант/i)
  })
})
