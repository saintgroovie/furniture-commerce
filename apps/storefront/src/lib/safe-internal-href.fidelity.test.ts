/**
 * Regression: homepage must never expose bare numeric routes `/1` / `/2`.
 *
 *   yarn --cwd apps/storefront exec tsx src/lib/safe-internal-href.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { safeInternalHref } from "./safe-internal-href"

assert.equal(safeInternalHref("/1", "/catalog"), "/catalog")
assert.equal(safeInternalHref("/2", "/catalog"), "/catalog")
assert.equal(safeInternalHref("1", "/catalog"), "/catalog")
assert.equal(safeInternalHref("2", "/catalog"), "/catalog")
assert.equal(safeInternalHref("/catalog", "/"), "/catalog")
assert.equal(safeInternalHref("/product/prod_x", "/catalog"), "/product/prod_x")
assert.equal(safeInternalHref(null, "/kids/catalog"), "/kids/catalog")
assert.equal(safeInternalHref("https://evil.example", "/catalog"), "/catalog")

console.log("safe-internal-href.fidelity.test.ts: ok")
