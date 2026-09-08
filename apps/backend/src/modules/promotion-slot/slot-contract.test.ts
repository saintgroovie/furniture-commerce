import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  clampRotationInterval,
  isSlotWithinSchedule,
  normalizePromotionSlotInput,
  normalizeProductIds,
  PromotionSlotValidationError,
  type PromotionSlotRecord,
} from "./slot-contract.ts"

const existing: PromotionSlotRecord = {
  id: "slot_1",
  key: "catalog_main",
  enabled: true,
  label: "Специальная цена",
  product_ids: ["p1", "p2"],
  starts_at: null,
  ends_at: null,
  rotation_interval_ms: 7000,
}

describe("normalizeProductIds", () => {
  it("drops non-strings, blanks and duplicates, keeps order", () => {
    assert.deepEqual(normalizeProductIds(["b", " ", 1, "a", "b", null]), ["b", "a"])
  })
  it("non-array → []", () => {
    assert.deepEqual(normalizeProductIds({ 0: "x" }), [])
  })
})

describe("clampRotationInterval", () => {
  it("clamps into 6000..8000 and defaults to 7000", () => {
    assert.equal(clampRotationInterval(1000), 6000)
    assert.equal(clampRotationInterval(20000), 8000)
    assert.equal(clampRotationInterval(6500), 6500)
    assert.equal(clampRotationInterval(undefined), 7000)
    assert.equal(clampRotationInterval("7500"), 7500)
  })
})

describe("normalizePromotionSlotInput", () => {
  it("creates defaults when nothing exists", () => {
    const n = normalizePromotionSlotInput({}, null)
    assert.deepEqual(n, {
      enabled: false,
      label: null,
      product_ids: [],
      starts_at: null,
      ends_at: null,
      rotation_interval_ms: 7000,
    })
  })

  it("partial merge keeps existing fields", () => {
    const n = normalizePromotionSlotInput({ enabled: false }, existing)
    assert.equal(n.enabled, false)
    assert.equal(n.label, "Специальная цена")
    assert.deepEqual(n.product_ids, ["p1", "p2"])
  })

  it("reorder persists new order", () => {
    const n = normalizePromotionSlotInput({ product_ids: ["p2", "p1"] }, existing)
    assert.deepEqual(n.product_ids, ["p2", "p1"])
  })

  it("remove product", () => {
    const n = normalizePromotionSlotInput({ product_ids: ["p2"] }, existing)
    assert.deepEqual(n.product_ids, ["p2"])
  })

  it("label trimmed; empty → null; too long → error", () => {
    assert.equal(normalizePromotionSlotInput({ label: "  Скидка " }, existing).label, "Скидка")
    assert.equal(normalizePromotionSlotInput({ label: "   " }, existing).label, null)
    assert.throws(
      () => normalizePromotionSlotInput({ label: "x".repeat(41) }, existing),
      PromotionSlotValidationError
    )
  })

  it("rejects more than 6 products", () => {
    assert.throws(
      () =>
        normalizePromotionSlotInput(
          { product_ids: ["a", "b", "c", "d", "e", "f", "g"] },
          existing
        ),
      (e: unknown) => e instanceof PromotionSlotValidationError && e.field === "product_ids"
    )
  })

  it("rejects ends_at <= starts_at and invalid dates", () => {
    assert.throws(
      () =>
        normalizePromotionSlotInput(
          { starts_at: "2026-09-10T00:00:00Z", ends_at: "2026-09-09T00:00:00Z" },
          existing
        ),
      (e: unknown) => e instanceof PromotionSlotValidationError && e.field === "ends_at"
    )
    assert.throws(
      () => normalizePromotionSlotInput({ starts_at: "not-a-date" }, existing),
      PromotionSlotValidationError
    )
  })

  it("clears schedule with null", () => {
    const withSchedule = { ...existing, starts_at: "2026-09-01T00:00:00Z" }
    const n = normalizePromotionSlotInput({ starts_at: null }, withSchedule)
    assert.equal(n.starts_at, null)
  })
})

describe("isSlotWithinSchedule", () => {
  const now = new Date("2026-09-08T12:00:00Z")
  it("no bounds → true", () => {
    assert.equal(isSlotWithinSchedule({ starts_at: null, ends_at: null }, now), true)
  })
  it("future start → false; past end → false", () => {
    assert.equal(isSlotWithinSchedule({ starts_at: "2026-09-09T00:00:00Z", ends_at: null }, now), false)
    assert.equal(isSlotWithinSchedule({ starts_at: null, ends_at: "2026-09-08T11:59:59Z" }, now), false)
  })
})
