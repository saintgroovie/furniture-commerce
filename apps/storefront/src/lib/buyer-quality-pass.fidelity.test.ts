/**
 * Buyer quality pass regressions (Q001 count unit / Q003 about / Q004 contacts).
 * Q002 home adjacency is a documented false_positive (no markup change).
 *
 *   yarn exec tsx src/lib/buyer-quality-pass.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

function read(relFromSrc: string): string {
  return readFileSync(join(srcRoot, relFromSrc), "utf8")
}

// Q004 — showroom address: comma between entrance and floor
const sot = read("lib/showroom-contacts.ts")
assert.match(
  sot,
  /addressLines:\s*\[[\s\S]*?"МТК «Гранд-2», вход 3, 4 этаж"/
)
assert.match(
  sot,
  /streetAddress:\s*"ул\. Бутаково, д\. 4, МТК «Гранд-2», вход 3, 4 этаж, подиум Woodright"/
)
assert.doesNotMatch(
  sot,
  /addressLines:\s*\[[\s\S]*?"вход 3",\s*"4 этаж/
)

// Q003 — about lead/mission must use CopyLines (not raw string[] in <p>)
for (const page of [
  "app/about/page.tsx",
  "app/about/materials/page.tsx",
  "app/about/production/page.tsx",
]) {
  const src = read(page)
  assert.match(src, /from "@\/components\/copy-lines"/)
  assert.match(src, /<CopyLines\b/)
  assert.doesNotMatch(src, /<p className="info-text">\{/)
}

// Q001 wiring — «Все» uses AllCount fields, not sum of option counts
const controls = read("components/catalog-filter-controls.tsx")
assert.match(controls, /facets\.collectionAllCount/)
assert.match(controls, /facets\.categoryAllCount/)
assert.doesNotMatch(
  controls,
  /facets\.collections\.reduce|facets\.categories\.reduce/
)

const filters = read("lib/catalog-filters.ts")
assert.match(filters, /categoryAllCount:\s*groupProductsForDisplay/)
assert.match(filters, /collectionAllCount:\s*groupProductsForDisplay/)
assert.match(filters, /countDisplayEntriesByKey/)

console.log("buyer-quality-pass.fidelity.test.ts: ok")
