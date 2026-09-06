/**
 * Guard: bespoke catalog and PDP display-group siblings must use lean
 * `/store/catalog-products`, not the fat `/store/products` list.
 *
 *   yarn exec tsx src/lib/bespoke.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const bespoke = readFileSync(join(root, "lib/bespoke.ts"), "utf8")
assert.match(bespoke, /getCatalogProducts/)
assert.doesNotMatch(bespoke, /getProducts\s*\(/)

const pdp = readFileSync(join(root, "app/product/[id]/page.tsx"), "utf8")
assert.match(pdp, /getCatalogProducts/)
assert.doesNotMatch(
  pdp,
  /const plist = await getProducts\s*\(/
)
assert.doesNotMatch(pdp, /import \{[^}]*\bgetProducts\b/)

console.log("bespoke.fidelity.test.ts: ok")
