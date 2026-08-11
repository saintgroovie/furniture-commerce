/**
 * Guest order-track token handoff fidelity (no Next runtime).
 * Run from apps/storefront:
 *   node --experimental-strip-types src/lib/order-track-token-handoff.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  buildGuestOrderTrackPath,
  orderTrackSessionKey,
  parseOrderTrackFragmentToken,
  stripLegacyQueryTokenFromOrderTrackSearch,
} from "./order-track-token-handoff"

{
  const path = buildGuestOrderTrackPath("order_01TEST", "abc_SECRET_token_value")
  assert.equal(
    path,
    "/orders/track?order_id=order_01TEST#token=abc_SECRET_token_value"
  )
  assert.equal(path.includes("?token="), false)
  assert.equal(path.includes("&token="), false)
  assert.ok(path.includes("#token="))
  // HTTP request target (pathname+search) has no token
  const u = new URL(path, "https://woodright-demo.ru")
  assert.equal(u.searchParams.has("token"), false)
  assert.equal(u.hash.startsWith("#token="), true)
}

{
  assert.equal(
    parseOrderTrackFragmentToken("#token=abc_SECRET_token_value"),
    "abc_SECRET_token_value"
  )
  assert.equal(
    parseOrderTrackFragmentToken(
      "#token=abc_SECRET_token_value&x=1"
    ),
    "abc_SECRET_token_value"
  )
  assert.equal(parseOrderTrackFragmentToken(""), null)
  assert.equal(parseOrderTrackFragmentToken("#"), null)
  assert.equal(parseOrderTrackFragmentToken("#foo=bar"), null)
  assert.equal(parseOrderTrackFragmentToken("not-a-hash"), null)
}

{
  const r = stripLegacyQueryTokenFromOrderTrackSearch(
    "/orders/track",
    "?token=abc_SECRET_token_value&order_id=order_01TEST"
  )
  assert.ok(r)
  assert.equal(r!.nextSearch, "?order_id=order_01TEST")
  assert.equal(r!.nextSearch.includes("token"), false)
}

assert.equal(
  stripLegacyQueryTokenFromOrderTrackSearch(
    "/orders/track",
    "?order_id=order_01TEST"
  ),
  null
)

assert.equal(
  stripLegacyQueryTokenFromOrderTrackSearch(
    "/cart",
    "?token=abc&order_id=x"
  ),
  null
)

assert.equal(
  orderTrackSessionKey("order_01A"),
  "woodright_order_token:order_01A"
)

console.log("order-track-token-handoff.fidelity: ok")
