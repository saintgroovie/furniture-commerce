import assert from "node:assert/strict"
import { hasProvencePaintWoodDualFinishEvidence as dual } from "./provence-finish-execution-guard"

const photos = (sku: string, names: string[]) => names.map((name) =>
  `/static/products/provence/${sku}${name.startsWith("i") ? "-" : "_"}${name}.jpg`
)

for (const sku of ["pv-05-2", "pv-06-2", "pv-08-2", "pv-55-1", "pv-62-1", "pv-61-1"]) {
  assert.equal(dual(photos(sku, ["i1", "i2", "i3", "i4"]), sku), true)
  assert.equal(dual(photos(sku, ["i1", "i2"]), sku), false, `${sku}: two white angles are one finish`)
  assert.equal(dual(photos(sku, ["i3", "i4"]), sku), false)
}
assert.equal(dual(photos("pv-09-1", ["i1", "i2", "main"]), "pv-09-1"), true)
assert.equal(dual(photos("pv-42-2", ["i1", "gallery_02", "i3"]), "pv-42-2"), true)
assert.equal(dual(photos("pv-65-8", ["i1", "i2", "main"]), "pv-65-8"), true)
assert.equal(dual(photos("pv-05-2", ["i1", "i3"]), "pv-03-1"), false, "foreign SKU photos are not evidence")
assert.equal(dual([...photos("pv-05-2", ["i1", "i3"]), "/static/imports/Provence_White_page_2.jpg"], "pv-05-2"), false)
console.log("provence-finish-execution-guard fidelity: ok")
