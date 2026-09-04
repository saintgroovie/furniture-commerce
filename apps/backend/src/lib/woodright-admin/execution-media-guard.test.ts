import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { hasExecutionMediaContract } from "./execution-media-guard.ts"

describe("hasExecutionMediaContract", () => {
  it("is false for a STANDARD product without execution media", () => {
    assert.equal(
      hasExecutionMediaContract({
        collection: "oliver",
        material_tiers: {
          solid_full: { key: "solid_full", price_multiplier: 1 },
        },
      }),
      false
    )
    assert.equal(hasExecutionMediaContract(null), false)
  })

  it("is true when execution_dimension_contract is set", () => {
    assert.equal(
      hasExecutionMediaContract({
        execution_dimension_contract: "paint_finish|frame_material|shared_scene",
      }),
      true
    )
  })

  it("is true for paint finish executions", () => {
    assert.equal(
      hasExecutionMediaContract({
        paint_finish_executions: [{ key: "white", urls: ["/static/a.jpg"] }],
      }),
      true
    )
  })

  it("is true for shared scene media", () => {
    assert.equal(
      hasExecutionMediaContract({
        shared_scene_media: [{ key: "scene", urls: ["/static/scene.jpg"] }],
      }),
      true
    )
  })
})
