import assert from "node:assert/strict"
import { buildIntraProductExecutionSelectors, containCatalogCardExecutionSelectors } from "./card-color-media"
const fabrics = [
  { key: "striped", label: "Серая полоска", urls: ["/static/products/provence/pv-23-1-i4.jpg"], swatch_hex: "#a7a9aa" },
  { key: "green", label: "Зелёная", urls: ["/static/products/provence/pv-23-1-i2.jpg"], swatch_hex: "#a7b6a3" },
]
// Explicit fabrics on one frame survive the unrelated Provence paint/wood guard.
const product = { handle: "pv-23-1", title: "Стул", metadata: { fabric_upholstery_executions: fabrics } }
const selectors = buildIntraProductExecutionSelectors(product, fabrics[0].urls[0])
assert.deepEqual(selectors.upholstery?.map(v => v.key), ["striped", "green"])
assert.equal(selectors.finish, undefined)
assert.equal(selectors.provencePaintWood, undefined)
assert.deepEqual(selectors.upholstery?.map(v => v.mainSrc.split("/").pop()), ["pv-23-1-i4.jpg", "pv-23-1-i2.jpg"])
// A collection/family key still has no invented color, but individual colors remain on cards.
const oliver = { handle: "ol-55-2", metadata: { fabric_upholstery_executions: fabrics.map((r, i) => ({ ...r, key: `lorna-${i + 1}` })) } }
const card = containCatalogCardExecutionSelectors(buildIntraProductExecutionSelectors(oliver, ""), oliver)
assert.equal(card.upholstery?.length, 2)
assert.ok(card.upholstery?.every(v => v.swatchHex))
// A single photo or a gallery alone is not a second fabric.
assert.equal(buildIntraProductExecutionSelectors({ ...product, metadata: { fabric_upholstery_executions: [fabrics[0]] } }, "").upholstery, undefined)
assert.equal(buildIntraProductExecutionSelectors({ handle: "pv-23-1", images: fabrics.flatMap(r => r.urls).map(url => ({ url })) }, "").upholstery, undefined)
// Fabric metadata must not bypass the old guard for an unsupported second axis.
for (const axis of ["paint_finish_executions", "finish_color_executions", "frame_material_executions"]) {
  const mixed = { ...product, metadata: { ...product.metadata, [axis]: [
    { key: "light", label: "Светлый", urls: ["/static/light.jpg"] },
    { key: "dark", label: "Тёмный", urls: ["/static/dark.jpg"] },
  ] } }
  assert.equal(buildIntraProductExecutionSelectors(mixed, "").confidence, "metadata_blocked", axis)
}
console.log("upholstery-gallery-colors.fidelity.test.ts: PASS")
