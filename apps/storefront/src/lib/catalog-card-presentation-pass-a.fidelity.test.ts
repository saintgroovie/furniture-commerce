/**
 * PASS A — catalog product-card presentation containment.
 *   yarn dlx tsx src/lib/catalog-card-presentation-pass-a.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  buildIntraProductExecutionSelectors,
  containCatalogCardExecutionSelectors,
  isFabricFamilyOnlyUpholstery,
  isFabricFamilyUpholsteryKey,
} from "./card-color-media"
import {
  formatDimensionsCompact,
  formatDimensionsCompactLabeled,
} from "./product-metadata"

function fabricProduct(
  handle: string,
  keys: string[],
  extras: Record<string, unknown> = {}
) {
  return {
    handle,
    thumbnail: `/static/products/oliver/${handle}_x.jpg`,
    metadata: {
      fabric_upholstery_executions: keys.map((key) => ({
        key,
        label: key,
        urls: [`/static/products/oliver/${handle}_color_${key}_01.jpg`],
        swatch_hex: "#cccccc",
      })),
      ...extras,
    },
  }
}

{
  assert.equal(isFabricFamilyUpholsteryKey("leona"), true)
  assert.equal(isFabricFamilyUpholsteryKey("LILLIAN"), true)
  assert.equal(isFabricFamilyUpholsteryKey("beige"), false)
  assert.equal(
    isFabricFamilyOnlyUpholstery([
      { key: "leona", label: "leona", mainSrc: "a", extraSrcs: [] },
      { key: "lorna", label: "lorna", mainSrc: "b", extraSrcs: [] },
    ]),
    true
  )
}

{
  const dim = { height_mm: 530, width_mm: 660, depth_mm: 460 }
  const compact = formatDimensionsCompact(dim)
  assert.match(compact, /^53\u202F×\u202F66\u202F×\u202F46$/)
  assert.equal(formatDimensionsCompactLabeled(dim).caption, "В × Ш × Г, см")
  assert.equal(formatDimensionsCompactLabeled(dim).values, compact)
}

{
  const partial = formatDimensionsCompactLabeled({
    height_mm: 900,
    width_mm: 1200,
    depth_mm: 0,
  })
  assert.equal(partial.values, "В 90 · Ш 120")
  assert.equal(partial.caption, "см")
}

for (const [handle, keys] of [
  ["ol-07-1", ["leona", "lillian", "linda", "lorna"]],
  ["ol-23-1", ["leona", "lillian", "linda", "lorna", "torno"]],
  ["ol-55-1", ["leona", "lorna", "torno"]],
  ["ol-14-1", ["lillian", "lorna"]],
] as Array<[string, string[]]>) {
  const product = fabricProduct(handle, keys)
  const raw = buildIntraProductExecutionSelectors(product, "/static/x.jpg")
  // PASS B.1: one upholstery axis (families as values), never separateFabricRows.
  assert.equal(raw.separateFabricRows, undefined, handle)
  assert.equal(raw.upholstery?.length, keys.length, handle)
  const card = containCatalogCardExecutionSelectors(raw, product)
  assert.equal(card.separateFabricRows, undefined, handle)
  assert.equal(card.upholstery, undefined, handle)
}

{
  const card = containCatalogCardExecutionSelectors(
    {
      upholstery: [
        { key: "leona", label: "leona", mainSrc: "a", extraSrcs: [] },
        { key: "beige", label: "Бежевый", mainSrc: "b", extraSrcs: [], swatchHex: "#d6cfc2" },
      ],
      confidence: "canonical",
    },
    { handle: "ol-07-1" }
  )
  assert.equal(card.upholstery?.length, 1)
  assert.equal(card.upholstery?.[0]?.key, "beige")
}

{
  const card = containCatalogCardExecutionSelectors({
    finish: [
      { key: "white", label: "Белый", mainSrc: "a", extraSrcs: [], swatchHex: "#fff" },
      { key: "graphite", label: "Графит", mainSrc: "b", extraSrcs: [], swatchHex: "#333" },
    ],
    finishLabel: "Цвет",
    wood: [
      { key: "natural", label: "Натуральный", mainSrc: "c", extraSrcs: [] },
      { key: "dark", label: "Тёмный", mainSrc: "d", extraSrcs: [] },
    ],
    confidence: "canonical",
  }, { handle: "greenwich-gr-08-1" })
  assert.equal(card.finish?.length, 2)
  assert.equal(card.wood?.length, 2)
}

{
  const card = containCatalogCardExecutionSelectors({
    upholstery: [
      { key: "beige", label: "Светло-серая", mainSrc: "a", extraSrcs: [], swatchHex: "#d6cfc2" },
      { key: "darkblue", label: "Сине-зелёная", mainSrc: "b", extraSrcs: [], swatchHex: "#2a3a40" },
    ],
    confidence: "canonical",
  }, { handle: "greenwich-gr-09-1-bed-90" })
  assert.equal(card.upholstery?.length, 2)
}

{
  const product = {
    handle: "ol-56-1",
    thumbnail: "/static/products/oliver/ol-56-1.jpg",
    metadata: {
      finish_color_executions: [
        {
          key: "lilian",
          label: "lillian",
          urls: ["/static/products/oliver/OL-56-1_color_lillian_01.jpg"],
        },
      ],
    },
  }
  const raw = buildIntraProductExecutionSelectors(product, product.thumbnail)
  const card = containCatalogCardExecutionSelectors(raw, product)
  assert.equal(card.separateFabricRows, undefined)
  assert.equal(card.upholstery, undefined)
  assert.equal(card.finish, undefined)
}

{
  const card = containCatalogCardExecutionSelectors(
    {
      finish: [
        { key: "torno", label: "Torno", mainSrc: "a", extraSrcs: [], swatchHex: "#7a6e66" },
      ],
      finishLabel: "Цвет",
      confidence: "canonical",
    },
    { handle: "co-14-2" }
  )
  assert.equal(card.finish?.[0]?.key, "torno")
}

{
  const card = containCatalogCardExecutionSelectors(
    {
      finish: [{ key: "torno", label: "torno", mainSrc: "a", extraSrcs: [] }],
      finishLabel: "Цвет",
      confidence: "canonical",
    },
    { handle: "ol-55-1" }
  )
  assert.equal(card.finish, undefined)
}

console.log("catalog-card-presentation-pass-a.fidelity.test.ts: ok")
