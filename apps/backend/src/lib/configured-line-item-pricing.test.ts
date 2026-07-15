/**
 * Focused regression for material × finish configured pricing (A1/B1).
 *
 * Run from apps/backend:
 *   yarn node --import tsx --test src/lib/configured-line-item-pricing.test.ts
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  fixtureMaterialTiersMetadata,
  resolveConfiguredLineItemPricing,
} from "./configured-line-item-pricing"
import {
  resolveConfiguredUnitPrice,
  resolveFinishColorMultiplier,
} from "./finish-color-premium-contract"
import { resolveMaterialTierPrice } from "./material-tier-contract"

const BASE = 28400

const finishMeta = fixtureMaterialTiersMetadata({
  paint_finish_executions: [
    { key: "milk", label: "Молочный" },
    { key: "graphite", label: "Графит" },
  ],
})

describe("resolveMaterialTierPrice / resolveConfiguredUnitPrice", () => {
  it("LDSP is round(base × 0.7)", () => {
    assert.equal(resolveMaterialTierPrice(BASE, 0.7), 19880)
    assert.equal(resolveConfiguredUnitPrice(BASE, 0.7, 1), 19880)
  })

  it("full solid is base", () => {
    assert.equal(resolveMaterialTierPrice(BASE, 1), BASE)
    assert.equal(resolveConfiguredUnitPrice(BASE, 1, 1), BASE)
  })

  it("rounds once after material × color (formula is single Math.round)", () => {
    assert.equal(resolveConfiguredUnitPrice(BASE, 0.7, 1.05), Math.round(BASE * 0.7 * 1.05))
    assert.equal(resolveConfiguredUnitPrice(BASE, 0.7, 1.05), 20874)
    // Base where round-then-round diverges from single-round.
    const b = 9
    const single = Math.round(b * 0.7 * 1.05)
    const double = Math.round(Math.round(b * 0.7) * 1.05)
    assert.notEqual(single, double)
    assert.equal(resolveConfiguredUnitPrice(b, 0.7, 1.05), single)
  })
})

describe("resolveFinishColorMultiplier", () => {
  it("standard finish → 1, premium → 1.05", () => {
    assert.equal(resolveFinishColorMultiplier(finishMeta, "milk"), 1)
    assert.equal(resolveFinishColorMultiplier(finishMeta, "graphite"), 1.05)
  })
})

describe("resolveConfiguredLineItemPricing — B1 / A1 / metadata rewrite", () => {
  it("B1: missing material code when tiers exist → MATERIAL_EXECUTION_REQUIRED", () => {
    const r = resolveConfiguredLineItemPricing({
      productMetadata: finishMeta,
      materialExecutionCode: null,
      finishExecutionKey: null,
      calculatedBaseAmount: BASE,
      metadata: { probe: true },
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, "MATERIAL_EXECUTION_REQUIRED")
  })

  it("A1: missing calculated_price on configured path → VARIANT_PRICE_NOT_FOUND", () => {
    const r = resolveConfiguredLineItemPricing({
      productMetadata: finishMeta,
      materialExecutionCode: "solid_front_ldsp_body",
      finishExecutionKey: null,
      calculatedBaseAmount: null,
      metadata: {},
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, "VARIANT_PRICE_NOT_FOUND")
  })

  it("unknown material code → UNKNOWN_MATERIAL_EXECUTION", () => {
    const r = resolveConfiguredLineItemPricing({
      productMetadata: finishMeta,
      materialExecutionCode: "not_a_tier",
      finishExecutionKey: null,
      calculatedBaseAmount: BASE,
      metadata: {},
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, "UNKNOWN_MATERIAL_EXECUTION")
  })

  it("unknown finish key → UNKNOWN_FINISH_EXECUTION", () => {
    const r = resolveConfiguredLineItemPricing({
      productMetadata: finishMeta,
      materialExecutionCode: "solid_full",
      finishExecutionKey: "neon-pink",
      calculatedBaseAmount: BASE,
      metadata: {},
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, "UNKNOWN_FINISH_EXECUTION")
  })

  it("rewrites client-forged labels/multipliers/resolved and pins LDSP unit_price", () => {
    const r = resolveConfiguredLineItemPricing({
      productMetadata: finishMeta,
      materialExecutionCode: "solid_front_ldsp_body",
      finishExecutionKey: null,
      calculatedBaseAmount: BASE,
      metadata: {
        material_execution_code: "solid_front_ldsp_body",
        // These should already be stripped by the route; defense in depth:
        leftover: "ok",
      },
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.unitPrice, 19880)
    assert.equal(r.resolved, 19880)
    assert.equal(r.materialMultiplier, 0.7)
    assert.equal(r.metadata.material_execution_label, "Фасады из массива + корпус ЛДСП")
    assert.equal(r.metadata.material_price_multiplier, 0.7)
    assert.equal(r.metadata.resolved_unit_price, 19880)
    assert.equal(r.metadata.leftover, "ok")
  })

  it("LDSP + premium finish applies both multipliers once", () => {
    const r = resolveConfiguredLineItemPricing({
      productMetadata: finishMeta,
      materialExecutionCode: "solid_front_ldsp_body",
      finishExecutionKey: "graphite",
      calculatedBaseAmount: BASE,
      metadata: {},
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.unitPrice, 20874)
    assert.equal(r.colorMultiplier, 1.05)
    assert.equal(r.metadata.finish_execution_label, "Графит")
    assert.equal(r.metadata.finish_color_multiplier, 1.05)
  })

  it("full solid + standard finish: resolved=base, no custom unit_price pin", () => {
    const r = resolveConfiguredLineItemPricing({
      productMetadata: finishMeta,
      materialExecutionCode: "solid_full",
      finishExecutionKey: "milk",
      calculatedBaseAmount: BASE,
      metadata: {},
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.resolved, BASE)
    assert.equal(r.unitPrice, undefined)
    assert.equal(r.colorMultiplier, 1)
  })

  it("product without tiers and without finish → default Medusa path", () => {
    const r = resolveConfiguredLineItemPricing({
      productMetadata: {},
      materialExecutionCode: null,
      finishExecutionKey: null,
      calculatedBaseAmount: BASE,
      metadata: { note: "plain" },
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.needsConfiguredPricing, false)
    assert.equal(r.unitPrice, undefined)
    assert.equal(r.metadata.note, "plain")
  })
})

console.log("configured-line-item-pricing.test.ts: ok")
