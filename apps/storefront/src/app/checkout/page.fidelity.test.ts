/**
 * Header payment note must render via CopyLines, not a raw string[].
 * React concatenates array children without a space:
 * «нужноПосле» instead of two meaning lines.
 *
 *   yarn dlx tsx src/app/checkout/page.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { checkoutCopy } from "../../lib/woodright-copy"

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8"
)

assert.match(src, /CopyLines/)
assert.match(src, /lines=\{checkoutCopy\.paymentClarity\}/)
assert.doesNotMatch(
  src,
  /<p className="checkout-payment-clarity checkout-payment-clarity-page">\s*\{checkoutCopy\.paymentClarity\}/
)

assert.equal(checkoutCopy.paymentClarity.length, 2)
assert.equal(checkoutCopy.paymentClarity[0], "Сейчас оплачивать заказ не нужно")
assert.match(checkoutCopy.paymentClarity[1], /^После оформления/)

console.log("checkout page paymentClarity layout fidelity: ok")
