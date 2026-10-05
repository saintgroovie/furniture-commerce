/**
 * Compatibility labels and the existing changing-top category.
 * Reads source so the check does not boot React.
 *   yarn dlx tsx src/lib/accessory-compatibility.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const copy = readFileSync("src/lib/woodright-copy.ts", "utf8")
const filters = readFileSync("src/lib/catalog-filters.ts", "utf8")
const page = readFileSync("src/app/product/[id]/page.tsx", "utf8")
const component = readFileSync("src/components/pdp-compatibility.tsx", "utf8")

assert.match(copy, /fitsThisProduct: "Подходит к этому товару"/)
assert.match(copy, /compatibleWith: "Совместим с"/)
assert.match(filters, /"pelenalnye-stoleshnicy": "Пеленальные столешницы"/)
assert.match(page, /PdpCompatibility/)
assert.doesNotMatch(component, /PR-83-1|OL-83-1|OL-05-1/)
assert.doesNotMatch(component, /addToCart|variant_id/)

console.log("accessory-compatibility.fidelity.test.ts: ok")
