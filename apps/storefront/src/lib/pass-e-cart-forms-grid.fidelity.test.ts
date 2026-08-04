/**
 * PASS E: cart / bespoke / contacts share the ~1200 outer container; desktop
 * cart+bespoke use a full-width 2fr/1fr inner split (not the legacy 50%/25%
 * narrow shell). Mobile stays single-column.
 *
 *   yarn exec tsx src/lib/pass-e-cart-forms-grid.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const css = read("src/app/globals.css")
assert.match(css, /--max-width:\s*1200px/)
assert.match(css, /\.container\s*\{[^}]*max-width:\s*var\(--max-width\)/s)
assert.match(
  css,
  /\.bespoke-request-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(0,\s*1fr\)/s
)
assert.doesNotMatch(css, /grid-template-columns:\s*50%\s+25%/)
assert.match(css, /\.bespoke-request-layout\s*\{[^}]*grid-template-columns:\s*1fr/s)

const cartPage = read("src/app/cart/page.tsx")
assert.match(cartPage, /bespoke-request-page/)
assert.match(cartPage, /CartSummary/)

const cartSummary = read("src/components/cart-summary.tsx")
assert.match(cartSummary, /bespoke-request-layout/)
assert.match(cartSummary, /bespoke-request-help/)

const bespokeRequest = read("src/app/bespoke/request/page.tsx")
assert.match(bespokeRequest, /bespoke-request-layout/)

console.log("pass-e-cart-forms-grid.fidelity: ok")
