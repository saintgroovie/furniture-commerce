/** Closed approved D02/D17 retirement scope; publishing a source always wins. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PREPARED_REDIRECTS, retiredProductRedirect, retiredRedirectTarget } from "./retired-product-handles"

const cases = [
  ["ol-08-2", "prod_01KNTBXADECY5WKNET16F2ET5W", "ol-08-1", "variant_01KNTBXBMAY8AB48VM5QEEKK2R"],
  ["greenwich-gr-09-1-bed-90", "prod_01KM1QHNHZXXSRPFEKAZRSFPDE", "greenwich-gr-12-1", "variant_01KM1QHQ65TXYKJN8PQJ5KM5JP"],
  ["greenwich-gr-14-1", "prod_01KM1QHNJ0F34R2A8FQ1CN4V1Y", "greenwich-gr-12-1", "variant_01KM1QHQ6791A8ZTF6SA4W47C6"],
  ["greenwich-gr-16-1", "prod_01KM1QHNJ1E92BMJQ8CE2RX7TK", "greenwich-gr-12-1", "variant_01KM1QHQ67950W0Q81TF7F51EM"],
  ["greenwich-gr-18-1", "prod_01KM1QHNJ1YTE9EW5NJZ8YRF62", "greenwich-gr-12-1", "variant_01KM1QHQ68EX7W37GWB0RQPQF9"],
]
assert.equal(Object.keys(PREPARED_REDIRECTS).length, 10)
for (const [handle, id, survivorHandle, variantId] of cases) {
  for (const key of [handle!, id!]) {
    assert.deepEqual(retiredProductRedirect(key), { survivorHandle, variantId })
    assert.deepEqual(retiredProductRedirect(` ${key.toUpperCase()} `), { survivorHandle, variantId })
    assert.equal(retiredRedirectTarget(key, true), null)
    assert.deepEqual(retiredRedirectTarget(key, false), { survivorHandle, variantId })
  }
  assert.equal(retiredProductRedirect(survivorHandle!), null)
}
for (const key of ["ol-15-1", "ol-14-1", "ol-08-1-mirror", "ol-08-n", "__proto__", "constructor", "toString", "hasOwnProperty", "not-a-product"]) {
  assert.equal(retiredProductRedirect(key), null, key)
  assert.equal(retiredRedirectTarget(key, false), null, key)
}
const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8")
assert.match(proxy, /productIsStillPublic/)
assert.match(proxy, /retiredRedirectTarget/)
assert.match(proxy, /searchParams\.set\("variant"/)
assert.match(proxy, /decodeURIComponent\(productHandle\[1\]\)/)
console.log("retired-product-handles.fidelity.test.ts: approved D02/D17 scope ok")
