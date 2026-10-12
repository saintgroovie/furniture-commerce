/**
 * Run: npx --yes tsx src/api/store/products/load-store-product-list.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(process.cwd(), "src/api/store/products/load-store-product-list.ts"), "utf8")
assert.match(source, /"options\.\*"/)
assert.match(source, /"variants\.options\.\*"/)
console.log("load-store-product-list.fidelity.test.ts: ok")
