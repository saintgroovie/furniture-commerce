/**
 * Cart SSR / cookie contract fidelity.
 *
 *   yarn exec tsx src/lib/cart-ssr.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const cookie = read("src/lib/cart/cart-cookie.ts")
assert.match(cookie, /CART_ID_COOKIE\s*=\s*"cart_id"/)

const page = read("src/app/cart/page.tsx")
assert.match(page, /cookies\(\)/)
assert.match(page, /CART_ID_COOKIE/)
assert.match(page, /initialViewState/)
assert.match(page, /hasCartCookie/)
assert.match(page, /"empty"/)
assert.match(page, /"loading"/)

const summary = read("src/components/cart-summary.tsx")
assert.match(summary, /initialViewState/)
assert.match(summary, /CartSummaryProps/)

const session = read("src/lib/cart/session.ts")
assert.match(session, /CART_ID_COOKIE/)
assert.doesNotMatch(session, /const CART_COOKIE\s*=/)

console.log("cart-ssr.fidelity: ok")
