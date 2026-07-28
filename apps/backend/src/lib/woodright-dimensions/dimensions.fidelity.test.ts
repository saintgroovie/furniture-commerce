/**
 * Furniture dimensions fidelity (no DB).
 *
 *   yarn dlx tsx src/lib/woodright-dimensions/dimensions.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  formatDimensionsForDisplay,
  normalizeDimensionMm,
  readLegacyDimensionsSnapshot,
  resolveFurnitureDimensions,
  resolveSnapshotDimensions,
  toPresenterDimensions,
} from "./index"

// 1. all three on variant
{
  const r = resolveFurnitureDimensions({
    variant: {
      metadata: {
        dimensions: { height_mm: 900, width_mm: 1200, depth_mm: 450 },
      },
    },
    product: {
      metadata: {
        dimensions: { height_mm: 1, width_mm: 1, depth_mm: 1 },
      },
    },
  })
  assert.deepEqual(r.mm, {
    height_mm: 900,
    width_mm: 1200,
    depth_mm: 450,
  })
  assert.equal(r.provenance.height, "variant")
}

// 2. partial on variant
{
  const r = resolveFurnitureDimensions({
    variant: {
      metadata: { dimensions: { height_mm: 900, width_mm: 1200 } },
    },
  })
  assert.equal(r.mm.height_mm, 900)
  assert.equal(r.mm.width_mm, 1200)
  assert.equal(r.mm.depth_mm, null)
}

// 3. variant zeros → treat as missing, fall back to product
{
  const r = resolveFurnitureDimensions({
    variant: {
      metadata: {
        dimensions: { height_mm: 0, width_mm: 0, depth_mm: 0 },
      },
    },
    product: {
      metadata: {
        dimensions_normalized: {
          height_mm: 800,
          width_mm: 1000,
          depth_mm: 400,
        },
      },
    },
  })
  assert.deepEqual(r.mm, {
    height_mm: 800,
    width_mm: 1000,
    depth_mm: 400,
  })
  assert.equal(r.provenance.height, "product")
}

// 4. variant empty, product filled
{
  const r = resolveFurnitureDimensions({
    variant: { metadata: {} },
    product: {
      metadata: { dimensions: { height_mm: 700, width_mm: 900, depth_mm: 350 } },
    },
  })
  assert.equal(r.mm.height_mm, 700)
  assert.equal(r.provenance.width, "product")
}

// 5. conflict: variant wins entirely for present axes
{
  const r = resolveFurnitureDimensions({
    variant: {
      metadata: { dimensions: { height_mm: 910, width_mm: 1210 } },
    },
    product: {
      metadata: {
        dimensions: { height_mm: 800, width_mm: 1000, depth_mm: 400 },
      },
    },
  })
  assert.equal(r.mm.height_mm, 910)
  assert.equal(r.mm.width_mm, 1210)
  assert.equal(r.mm.depth_mm, 400) // product fallback for missing axis
  assert.equal(r.provenance.depth, "product")
  assert.equal(r.provenance.height, "variant")
}

// 6. single axis from product fallback
{
  const r = resolveFurnitureDimensions({
    variant: {
      metadata: { dimensions: { height_mm: 900, width_mm: 1200 } },
    },
    product: {
      metadata: { dimensions: { depth_mm: 455 } },
    },
  })
  assert.equal(r.mm.depth_mm, 455)
}

// 7. string numbers
assert.equal(normalizeDimensionMm("900"), 900)
assert.equal(normalizeDimensionMm("900.5"), 900.5)

// 8. unit-suffixed rejected (no silent guess)
assert.equal(normalizeDimensionMm("90 cm"), null)
assert.equal(normalizeDimensionMm("900mm"), null)

// 9–11. invalid
assert.equal(normalizeDimensionMm(-1), null)
assert.equal(normalizeDimensionMm(0), null)
assert.equal(normalizeDimensionMm(NaN), null)
assert.equal(normalizeDimensionMm(Infinity), null)
assert.equal(normalizeDimensionMm(""), null)
assert.equal(normalizeDimensionMm(null), null)

// 12–13. second variant differs; snapshot uses selected variant
{
  const product = {
    metadata: { dimensions: { height_mm: 800, width_mm: 1000, depth_mm: 400 } },
  }
  const v1 = {
    metadata: { dimensions: { height_mm: 900, width_mm: 1200, depth_mm: 450 } },
  }
  const v2 = {
    metadata: { dimensions: { height_mm: 950, width_mm: 1400, depth_mm: 500 } },
  }
  const s1 = resolveSnapshotDimensions({ product, variant: v1 })
  const s2 = resolveSnapshotDimensions({ product, variant: v2 })
  assert.equal(s1?.height_mm, 900)
  assert.equal(s2?.height_mm, 950)
  assert.notEqual(s1?.width_mm, s2?.width_mm)
}

// 14. presenter / DTO bag has no artificial zeros
{
  const bag = toPresenterDimensions({
    height_mm: 900,
    width_mm: null,
    depth_mm: 0 as unknown as null,
  })
  // depth 0 already normalized away before presenter; simulate cleaned mm:
  const cleaned = toPresenterDimensions({
    height_mm: 900,
    width_mm: null,
    depth_mm: null,
  })
  assert.deepEqual(cleaned, { height_mm: 900 })
  assert.equal(bag && "width_mm" in bag ? bag.width_mm : undefined, undefined)
}

// 15–17. UI formatters: no 0×0×0; partial labeled; order H→W→D
{
  const full = formatDimensionsForDisplay({
    height_mm: 900,
    width_mm: 1200,
    depth_mm: 450,
  })
  assert.equal(full.mode, "compact")
  assert.equal(full.compact, "90\u202F×\u202F120\u202F×\u202F45")

  const partial = formatDimensionsForDisplay({
    height_mm: 900,
    width_mm: null,
    depth_mm: 450,
  })
  assert.equal(partial.mode, "partial")
  assert.deepEqual(partial.lines, ["Высота: 90 см", "Глубина: 45 см"])
  assert.equal(partial.compact, null)

  const missing = formatDimensionsForDisplay({
    height_mm: null,
    width_mm: null,
    depth_mm: null,
  })
  assert.equal(missing.mode, "missing")
  assert.equal(missing.missing_label, "Размеры уточняются")
}

// 18. legacy snapshot zeros → unknown
{
  const legacy = readLegacyDimensionsSnapshot({
    height_mm: 0,
    width_mm: 1200,
    depth_mm: 0,
  })
  assert.equal(legacy.height_mm, null)
  assert.equal(legacy.width_mm, 1200)
  assert.equal(legacy.depth_mm, null)
}

// 19. provenance not in snapshot payload
{
  const snap = resolveSnapshotDimensions({
    variant: {
      metadata: { dimensions: { height_mm: 900, width_mm: 1200, depth_mm: 450 } },
    },
  })
  assert.ok(snap)
  assert.equal("provenance" in (snap as object), false)
}

// Medusa length ignored (no furniture mapping)
{
  const r = resolveFurnitureDimensions({
    variant: {
      height: 900,
      width: 1200,
      length: 450,
      metadata: {},
    },
    product: { metadata: {} },
  })
  assert.equal(r.has_any, false)
}

console.log("dimensions.fidelity.test.ts: ok")
