import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  blockerLabel,
  formatRubAdmin,
  formatScheduleRu,
  isoToLocalInput,
  localInputToIso,
  moveItem,
  skipReasonLabel,
  slotStatusLabel,
} from "./catalog-promo-labels.ts"

describe("catalog-promo-labels", () => {
  it("formatRubAdmin groups and uses nbsp", () => {
    assert.equal(formatRubAdmin(98550), "98\u00a0550\u00a0₽")
    assert.equal(formatRubAdmin(null), "-")
  })

  it("blockerLabel covers every blocker without dashes", () => {
    for (const b of [
      "unpublished",
      "bespoke",
      "no_base_price",
      "no_sale_price",
      "sale_not_lower",
      "price_list_inactive",
      "no_image",
    ] as const) {
      const label = blockerLabel(b)
      assert.ok(label && label.length > 0)
      assert.equal(/[—–]/.test(label), false)
    }
    assert.equal(blockerLabel(null), null)
  })

  it("skipReasonLabel covers every storefront skip code", () => {
    const reasons = [
      "not_found",
      "unpublished",
      "bespoke",
      "not_purchasable",
      "no_sale_price",
      "no_image",
    ] as const
    for (const reason of reasons) {
      const label = skipReasonLabel(reason)
      assert.ok(label && label.length > 0)
      assert.equal(/[—–]/.test(label), false)
    }
    assert.equal(skipReasonLabel("not_found"), "Товар не найден")
    assert.equal(skipReasonLabel("not_purchasable"), "Товар нельзя купить отдельно")
    assert.equal(skipReasonLabel("no_sale_price"), blockerLabel("no_sale_price"))
  })

  it("formatScheduleRu", () => {
    assert.equal(formatScheduleRu(null, null), "Без ограничений по датам")
    assert.match(formatScheduleRu("2026-09-01T09:00:00Z", null), /^С 01\.09\.2026/)
    assert.match(formatScheduleRu(null, "2026-09-30T20:59:00Z"), /^До 30\.09\.2026/)
  })

  it("iso <-> local input round trip", () => {
    const iso = localInputToIso("2026-09-10T12:30")
    assert.ok(iso)
    assert.equal(isoToLocalInput(iso), "2026-09-10T12:30")
    assert.equal(localInputToIso(""), null)
    assert.equal(isoToLocalInput(null), "")
  })

  it("moveItem reorders and guards bounds", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"])
    assert.deepEqual(moveItem(["a", "b", "c"], 2, 1), ["a", "c", "b"])
    assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"])
  })

  it("slotStatusLabel", () => {
    assert.equal(slotStatusLabel({ enabled: false, visibleCount: 2, scheduleActive: true }).tone, "grey")
    assert.equal(slotStatusLabel({ enabled: true, visibleCount: 0, scheduleActive: true }).tone, "orange")
    assert.equal(slotStatusLabel({ enabled: true, visibleCount: 2, scheduleActive: false }).tone, "orange")
    assert.match(slotStatusLabel({ enabled: true, visibleCount: 1, scheduleActive: true }).text, /без ротации/)
    assert.match(slotStatusLabel({ enabled: true, visibleCount: 2, scheduleActive: true }).text, /2 товара/)
  })
})
