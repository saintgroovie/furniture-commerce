/**
 * Greenwich bed selection must coerce to a valid matrix cell — never leave
 * wood/fabric null after a single option click (that blanks PDP price).
 *
 *   npx tsx src/lib/greenwich-bed-selection-coerce.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  coerceGreenwichBedSelection,
  coerceGreenwichBedSelectionFabricFirst,
  type GreenwichBedMatrixEntry,
} from "./greenwich-bed-media"

const matrix: GreenwichBedMatrixEntry[] = [
  {
    headboard_model: "frame",
    frame_material: "natural",
    fabric_upholstery: "beige",
    urls: ["/m/frame-natural-beige.jpg"],
  },
  {
    headboard_model: "frame",
    frame_material: "dark",
    fabric_upholstery: "beige",
    urls: ["/m/frame-dark-beige.jpg"],
  },
  {
    headboard_model: "frame",
    frame_material: "natural",
    fabric_upholstery: "darkblue",
    urls: ["/m/frame-natural-darkblue.jpg"],
  },
  {
    headboard_model: "cloud",
    frame_material: "natural",
    fabric_upholstery: "beige",
    urls: ["/m/cloud-natural-beige.jpg"],
  },
]

{
  const c = coerceGreenwichBedSelection(matrix, "frame", "natural", "beige")
  assert.deepEqual(c, {
    headboard: "frame",
    frameMaterial: "natural",
    fabric: "beige",
  })
}

{
  /* Cloud has no dark wood — coerce wood (and keep fabric if possible). */
  const c = coerceGreenwichBedSelection(matrix, "cloud", "dark", "beige")
  assert.equal(c.headboard, "cloud")
  assert.equal(c.frameMaterial, "natural")
  assert.equal(c.fabric, "beige")
  assert.ok(c.frameMaterial, "must never return empty wood")
  assert.ok(c.fabric, "must never return empty fabric")
}

{
  const c = coerceGreenwichBedSelectionFabricFirst(
    matrix,
    "frame",
    "darkblue",
    "dark"
  )
  assert.equal(c.fabric, "darkblue")
  assert.equal(c.frameMaterial, "natural")
}

{
  let wood: string | null = "dark"
  let fabric: string | null = "beige"
  let lastHb = "frame"
  for (const hb of ["frame", "cloud", "frame", "cloud", "frame"] as const) {
    const c = coerceGreenwichBedSelection(matrix, hb, wood, fabric)
    wood = c.frameMaterial
    fabric = c.fabric
    lastHb = c.headboard
    assert.ok(wood && fabric)
  }
  assert.equal(lastHb, "frame")
  assert.ok(wood && fabric)
}

console.log("greenwich-bed-selection-coerce.fidelity.test.ts: ok")
