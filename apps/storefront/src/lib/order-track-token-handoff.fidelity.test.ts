/**
 * Guest order-track token handoff fidelity (no Next runtime).
 * Run from apps/storefront:
 *   node --experimental-strip-types src/lib/order-track-token-handoff.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  ORDER_TRACK_HANDOFF_COOKIE,
  decodeOrderTrackHandoff,
  encodeOrderTrackHandoff,
  orderTrackSessionKey,
  stripTokenFromOrderTrackSearch,
} from "./order-track-token-handoff.ts"

{
  const r = stripTokenFromOrderTrackSearch(
    "/orders/track",
    "?token=abc_SECRET_token_value&order_id=order_01TEST"
  )
  assert.ok(r)
  assert.equal(r!.token, "abc_SECRET_token_value")
  assert.equal(r!.orderId, "order_01TEST")
  assert.equal(r!.nextSearch, "?order_id=order_01TEST")
  assert.equal(r!.nextSearch.includes("token"), false)
}

{
  const enc = encodeOrderTrackHandoff("order_01A", "tok|with|bars")
  const dec = decodeOrderTrackHandoff(enc)
  assert.ok(dec)
  assert.equal(dec!.orderId, "order_01A")
  assert.equal(dec!.token, "tok|with|bars")
  assert.equal(decodeOrderTrackHandoff("not-a-handoff"), null)
}

assert.equal(
  stripTokenFromOrderTrackSearch("/orders/track", "?order_id=order_01TEST"),
  null
)

assert.equal(
  stripTokenFromOrderTrackSearch("/cart", "?token=abc&order_id=x"),
  null
)

assert.equal(ORDER_TRACK_HANDOFF_COOKIE, "wr_ot_handoff")
assert.equal(
  orderTrackSessionKey("order_01A"),
  "woodright_order_token:order_01A"
)

console.log("order-track-token-handoff.fidelity: ok")
