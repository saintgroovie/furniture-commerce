import assert from "node:assert/strict"
import { withoutHeadingDimensions } from "./product-heading"
import { getBuyerFacingProductTitle, getBuyerFacingProductTitleLayout } from "./product-metadata"
import { getProductSeoName } from "./product-seo"
import { explicitVariantSize } from "./product-variant-json-ld"

for (const title of ["Кровать (120×190)", "Кровать 120 * 190 см", "Кровать 120х190", "Кровать под матрас 120 x 190", "Кровать (120 × 190 × 80)"]) {
  assert.equal(withoutHeadingDimensions(title), "Кровать")
}
assert.equal(withoutHeadingDimensions("Комод (гл. 560) с 3 ящиками"), "Комод с 3 ящиками")
assert.equal(withoutHeadingDimensions("Стол ширина 120 см"), "Стол")
assert.equal(withoutHeadingDimensions("Стол (Ø60 см)"), "Стол")
assert.equal(withoutHeadingDimensions("Стол 1,2 м"), "Стол")
assert.equal(withoutHeadingDimensions("Шкаф с 2 дверцами и 3 ящиками"), "Шкаф с 2 дверцами и 3 ящиками")
assert.equal(withoutHeadingDimensions("Кровать (120×190) без изножья"), "Кровать без изножья")
const product = { title: "Кровать 1,5-сп. (140×190) без изножья", handle: "ol-16-2", metadata: { collection: "oliver" } }
const before = JSON.stringify(product)
for (const title of [getBuyerFacingProductTitle(product), getProductSeoName(product), ...getBuyerFacingProductTitleLayout(product).lines]) {
  assert.doesNotMatch(title, /\d\s*[×xх*]\s*\d/u)
  assert.match(title, /без изножья/u)
}
assert.equal(explicitVariantSize(product), "140×190")
assert.equal(JSON.stringify(product), before, "presentation does not mutate raw dimensions or identity")
console.log("product-heading.fidelity.test.ts: ok")
