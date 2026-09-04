import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyDimensionsToMetadata,
  parseDimensionsBody,
} from "./dimensions-command.ts"

describe("dimensions command", () => {
  it("converts 90 cm to 900 mm on height without swapping axes", () => {
    const result = applyDimensionsToMetadata(
      { collection: "oliver", paint_finish_executions: [{ key: "keep" }] },
      { height_cm: 90, width_cm: 166, depth_cm: 206 }
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.mm.height_mm, 900)
    assert.equal(result.mm.width_mm, 1660)
    assert.equal(result.mm.depth_mm, 2060)
    assert.deepEqual(result.metadata.dimensions, result.mm)
    assert.deepEqual(result.metadata.dimensions_normalized, result.mm)
    assert.equal(result.metadata.collection, "oliver")
    assert.equal(Array.isArray(result.metadata.paint_finish_executions), true)
  })

  it("converts 125.5 cm to 1255 mm", () => {
    const result = applyDimensionsToMetadata({}, { height_cm: 125.5, width_cm: null, depth_cm: null })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.mm.height_mm, 1255)
    assert.equal(result.mm.width_mm, undefined)
  })

  it("treats null as unknown and removes the axis", () => {
    const result = applyDimensionsToMetadata(
      { dimensions: { height_mm: 900, width_mm: 1660, depth_mm: 2060 } },
      { height_cm: null, width_cm: 166, depth_cm: null }
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.mm, { width_mm: 1660 })
    assert.equal("height_mm" in (result.metadata.dimensions as object), false)
  })

  it("omits both dimension keys when every axis is unknown", () => {
    const result = applyDimensionsToMetadata(
      { dimensions: { height_mm: 900 }, collection: "oliver" },
      { height_cm: null, width_cm: null, depth_cm: null }
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal("dimensions" in result.metadata, false)
    assert.equal("dimensions_normalized" in result.metadata, false)
    assert.equal(result.metadata.collection, "oliver")
  })

  it("rejects 0", () => {
    const parsed = parseDimensionsBody({ height_cm: 0, width_cm: null, depth_cm: null })
    assert.equal("ok" in parsed && parsed.ok === false, true)
  })

  it("treats empty string as unknown, not zero", () => {
    const parsed = parseDimensionsBody({ height_cm: "", width_cm: "  ", depth_cm: null })
    assert.equal("ok" in parsed && parsed.ok === false, false)
    if (!("ok" in parsed)) {
      assert.equal(parsed.height_cm, null)
      assert.equal(parsed.width_cm, null)
      assert.equal(parsed.depth_cm, null)
    }
    const applied = applyDimensionsToMetadata(
      { dimensions: { height_mm: 900 } },
      { height_cm: null, width_cm: null, depth_cm: null }
    )
    assert.equal(applied.ok, true)
    if (applied.ok) {
      assert.equal("dimensions" in applied.metadata, false)
      assert.equal(applied.mm.height_mm, undefined)
    }
  })

  it("rejects more than one decimal place instead of rounding", () => {
    const parsed = parseDimensionsBody({ height_cm: 125.55, width_cm: null, depth_cm: null })
    assert.equal("ok" in parsed && parsed.ok === false, true)
  })

  it("rejects negative sizes", () => {
    const parsed = parseDimensionsBody({ height_cm: -10, width_cm: null, depth_cm: null })
    assert.equal("ok" in parsed && parsed.ok === false, true)
  })

  it("preserves unrelated metadata keys", () => {
    const result = applyDimensionsToMetadata(
      {
        collection: "greenwich",
        material_tiers: { solid_full: { key: "solid_full" } },
        launch_mode: "request_quote",
      },
      { height_cm: 90, width_cm: null, depth_cm: null }
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.metadata.collection, "greenwich")
    assert.equal(result.metadata.launch_mode, "request_quote")
    assert.deepEqual(result.metadata.material_tiers, { solid_full: { key: "solid_full" } })
  })
})
