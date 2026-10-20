/**
 * Run: npx --yes tsx src/lib/offered-execution-key.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { offeredExecutionKey } from "./offered-execution-key"

const co15 = [{ key: "cream" }, { key: "blue" }, { key: "olive" }, { key: "grey" }]

assert.equal(offeredExecutionKey("torno", co15), "cream")
assert.equal(offeredExecutionKey("blue", co15), "blue")
assert.equal(offeredExecutionKey(null, co15), null)
assert.equal(offeredExecutionKey("torno", []), "torno")

const gallery = readFileSync(
  join(process.cwd(), "src/components/product-card-media-gallery-core.tsx"),
  "utf8"
)
assert.match(gallery, /offeredExecutionKey\(activeFinishKey, finishVariants\)/)
assert.match(gallery, /props\.executionScopeKey/)

const page = readFileSync(join(process.cwd(), "src/app/product/[id]/page.tsx"), "utf8")
assert.match(page, /executionScopeKey=\{selectedVariantId/)

console.log("offered-execution-key.fidelity.test.ts: ok")
