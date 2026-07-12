import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildPromotionStatusVM } from "./status.ts"

const NOW = new Date("2026-07-12T12:00:00.000Z")

describe("buildPromotionStatusVM", () => {
  it("maps draft", () => {
    const vm = buildPromotionStatusVM({ promotion: { status: "draft" }, now: NOW })
    assert.equal(vm.kind, "draft")
    assert.equal(vm.label, "Черновик")
    assert.equal(vm.effectively_active, false)
    assert.equal(vm.needs_attention, false)
  })

  it("maps inactive", () => {
    const vm = buildPromotionStatusVM({ promotion: { status: "inactive" }, now: NOW })
    assert.equal(vm.kind, "inactive")
    assert.match(vm.reason ?? "", /выключили/i)
  })

  it("maps plain active without campaign", () => {
    const vm = buildPromotionStatusVM({ promotion: { status: "active" }, now: NOW })
    assert.equal(vm.kind, "active")
    assert.equal(vm.effectively_active, true)
    assert.equal(vm.tone, "green")
  })

  it("maps scheduled when campaign starts in future", () => {
    const vm = buildPromotionStatusVM({
      promotion: {
        status: "active",
        campaign: { id: "camp_1", starts_at: "2026-08-01T00:00:00.000Z" },
      },
      now: NOW,
    })
    assert.equal(vm.kind, "scheduled")
    assert.equal(vm.effectively_active, false)
    assert.match(vm.reason ?? "", /Включится/)
  })

  it("maps expired when campaign already ended", () => {
    const vm = buildPromotionStatusVM({
      promotion: {
        status: "active",
        campaign: { id: "camp_1", ends_at: "2026-06-01T00:00:00.000Z" },
      },
      now: NOW,
    })
    assert.equal(vm.kind, "expired")
    assert.equal(vm.effectively_active, false)
  })

  it("maps invalid when campaign dates are inverted", () => {
    const vm = buildPromotionStatusVM({
      promotion: {
        status: "active",
        campaign: {
          id: "camp_1",
          starts_at: "2026-08-01T00:00:00.000Z",
          ends_at: "2026-07-01T00:00:00.000Z",
        },
      },
      now: NOW,
    })
    assert.equal(vm.kind, "invalid")
    assert.equal(vm.needs_attention, true)
  })

  it("maps usage budget exhaustion", () => {
    const vm = buildPromotionStatusVM({
      promotion: {
        status: "active",
        campaign: {
          id: "camp_1",
          budget: { type: "usage", limit: 100, used: 100 },
        },
      },
      now: NOW,
    })
    assert.equal(vm.kind, "usage_exhausted")
    assert.equal(vm.needs_attention, true)
    assert.match(vm.reason ?? "", /100 из 100/)
  })

  it("maps spend budget exhaustion", () => {
    const vm = buildPromotionStatusVM({
      promotion: {
        status: "active",
        campaign: {
          id: "camp_1",
          budget: { type: "spend", currency_code: "rub", limit: 50000, used: 61000 },
        },
      },
      now: NOW,
    })
    assert.equal(vm.kind, "budget_exhausted")
    assert.equal(vm.effectively_active, false)
  })

  it("keeps active while budget remains", () => {
    const vm = buildPromotionStatusVM({
      promotion: {
        status: "active",
        campaign: {
          id: "camp_1",
          budget: { type: "usage", limit: 100, used: 99 },
        },
      },
      now: NOW,
    })
    assert.equal(vm.kind, "active")
  })

  it("fails closed on unknown raw status", () => {
    const vm = buildPromotionStatusVM({
      promotion: { status: "archived" },
      now: NOW,
    })
    assert.equal(vm.kind, "unknown")
    assert.equal(vm.needs_attention, true)
    assert.match(vm.reason ?? "", /archived/)
  })

  it("fails closed on missing status", () => {
    const vm = buildPromotionStatusVM({ promotion: {}, now: NOW })
    assert.equal(vm.kind, "unknown")
  })
})
