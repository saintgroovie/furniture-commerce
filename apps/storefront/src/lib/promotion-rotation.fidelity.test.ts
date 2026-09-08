/**
 * Promotion Window rotation state machine.
 * Run: `yarn tsx src/lib/promotion-rotation.fidelity.test.ts` from apps/storefront
 */
import assert from "node:assert/strict"
import {
  clampRotationInterval,
  initialRotationState,
  isRotationRunning,
  ROTATION_DEFAULT_MS,
  ROTATION_MAX_MS,
  ROTATION_MIN_MS,
  rotationReducer,
} from "./promotion-rotation"

// Interval: seller value clamped to the calm 6-8 s window
assert.equal(clampRotationInterval(undefined), ROTATION_DEFAULT_MS)
assert.equal(clampRotationInterval(null), ROTATION_DEFAULT_MS)
assert.equal(clampRotationInterval(1000), ROTATION_MIN_MS)
assert.equal(clampRotationInterval(60_000), ROTATION_MAX_MS)
assert.equal(clampRotationInterval(6500), 6500)

// One product → static, no autoplay
{
  const s = initialRotationState(1)
  assert.equal(isRotationRunning(s), false)
  assert.equal(rotationReducer(s, { type: "tick" }).index, 0)
}

// Two products → rotation wraps around
{
  let s = initialRotationState(2)
  assert.equal(isRotationRunning(s), true)
  s = rotationReducer(s, { type: "tick" })
  assert.equal(s.index, 1)
  s = rotationReducer(s, { type: "tick" })
  assert.equal(s.index, 0)
}

// Pause on hover / focus / hidden tab; resume after
{
  let s = initialRotationState(3)
  s = rotationReducer(s, { type: "hover", value: true })
  assert.equal(isRotationRunning(s), false)
  assert.equal(rotationReducer(s, { type: "tick" }).index, 0)
  s = rotationReducer(s, { type: "hover", value: false })
  assert.equal(isRotationRunning(s), true)

  s = rotationReducer(s, { type: "focus", value: true })
  assert.equal(isRotationRunning(s), false)
  s = rotationReducer(s, { type: "focus", value: false })

  s = rotationReducer(s, { type: "visibility", hidden: true })
  assert.equal(isRotationRunning(s), false)
  s = rotationReducer(s, { type: "visibility", hidden: false })
  assert.equal(isRotationRunning(s), true)
}

// prefers-reduced-motion → autoplay off, manual select still works
{
  let s = initialRotationState(2, true)
  assert.equal(isRotationRunning(s), false)
  assert.equal(rotationReducer(s, { type: "tick" }).index, 0)
  s = rotationReducer(s, { type: "select", index: 1 })
  assert.equal(s.index, 1)
  s = rotationReducer(s, { type: "reduced_motion", value: false })
  assert.equal(isRotationRunning(s), true)
}

// Manual select normalises out-of-range indices
{
  const s = initialRotationState(3)
  assert.equal(rotationReducer(s, { type: "select", index: 5 }).index, 2)
  assert.equal(rotationReducer(s, { type: "select", index: -1 }).index, 2)
}

// Count shrink keeps index in range; zero → index 0
{
  let s = rotationReducer(initialRotationState(3), { type: "select", index: 2 })
  s = rotationReducer(s, { type: "count", count: 2 })
  assert.equal(s.index, 1)
  s = rotationReducer(s, { type: "count", count: 0 })
  assert.equal(s.index, 0)
  assert.equal(isRotationRunning(s), false)
}

// Unchanged events return the same object (no needless re-render)
{
  const s = initialRotationState(2)
  assert.equal(rotationReducer(s, { type: "hover", value: false }), s)
  assert.equal(rotationReducer(s, { type: "select", index: 0 }), s)
}

console.log("promotion-rotation.fidelity.test.ts: ok")
