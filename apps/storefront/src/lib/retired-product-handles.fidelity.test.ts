/**
 * Run: npx --yes tsx src/lib/retired-product-handles.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { retiredProductRedirect } from "./retired-product-handles"

const ol15 = retiredProductRedirect("ol-15-1")
assert.ok(ol15)
assert.equal(ol15.survivorHandle, "ol-14-1")
assert.equal(ol15.variantId, "variant_01KNTBXBMBX03GX9WTGQAA35HW")
assert.equal(retiredProductRedirect("ol-14-1"), null)
assert.equal(retiredProductRedirect("OL-15-1")?.survivorHandle, "ol-14-1")
assert.equal(retiredProductRedirect("not-a-product"), null)
const legacyShell = retiredProductRedirect("prod_01KNTBXADFNYAQGPEQKCM4NPZE")
assert.ok(legacyShell)
assert.equal(legacyShell.survivorHandle, "ol-14-1")
assert.equal(legacyShell.variantId, "variant_01KNTBXBMBTGQAE0VQC94SFJY6")
assert.equal(retiredProductRedirect("prod_01KNTBXADDACBVH2BM1JSB2MWH"), null)

const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8")
assert.match(proxy, /retiredProductRedirect\(decodeURIComponent/)

console.log("retired-product-handles.fidelity.test.ts: ok")
