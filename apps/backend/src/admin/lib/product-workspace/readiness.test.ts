import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildProductReadiness } from "./readiness.ts"

const base = {
  title: "Стол",
  description: "Дуб",
  classification: { code: "STANDARD" as const, label: "Готовый" },
  variantCount: 2,
  variantsTruncated: false,
  prices: { variants_without_price: 0, label: "10 000 ₽" },
  media: { has_thumbnail: true, image_count: 3 },
}

describe("buildProductReadiness", () => {
  it("marks ready when all must checks pass", () => {
    const vm = buildProductReadiness(base)
    assert.equal(vm.verification, "ready")
    assert.equal(vm.summary_label, "Карточка заполнена")
    assert.equal(vm.must_open, 0)
  })

  it("counts must failures for title, type, prices, thumbnail", () => {
    const vm = buildProductReadiness({
      ...base,
      title: "  ",
      classification: { code: null, label: "Тип не указан" },
      prices: { variants_without_price: 1, label: "10 000 ₽" },
      media: { has_thumbnail: false, image_count: 0 },
      description: "",
    })
    assert.equal(vm.verification, "needs_fixes")
    assert.equal(vm.must_open, 4)
    assert.ok(vm.should_open >= 2)
    assert.match(vm.summary_label, /Нужно исправить/)
  })

  it("returns unverified when variants are truncated", () => {
    const vm = buildProductReadiness({
      ...base,
      variantsTruncated: true,
    })
    assert.equal(vm.verification, "unverified")
    assert.equal(vm.summary_label, "Не удалось проверить")
    const prices = vm.items.find((i) => i.id === "prices")
    assert.equal(prices?.unverifiable, true)
  })

  it("fails variants must when there are none", () => {
    const vm = buildProductReadiness({
      ...base,
      variantCount: 0,
      prices: { variants_without_price: 0, label: "Нет вариантов" },
    })
    assert.equal(vm.verification, "needs_fixes")
    assert.ok(vm.items.find((i) => i.id === "variants" && !i.ok))
  })
})
