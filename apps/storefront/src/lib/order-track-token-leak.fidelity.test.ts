/**
 * Source-contract fidelity: fragment handoff; no query token transport.
 * Run from apps/storefront:
 *   node --experimental-strip-types src/lib/order-track-token-leak.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

{
  const src = readFileSync(
    join(root, "src/lib/woodright-order/api.ts"),
    "utf8"
  )
  assert.match(src, /Authorization:\s*`Bearer \$\{input\.token\}`/)
  assert.doesNotMatch(
    src,
    /process\?\$\{|process\?token=|URLSearchParams\(\{\s*token/
  )
}

{
  const src = readFileSync(
    join(root, "src/app/orders/track/order-track-client.tsx"),
    "utf8"
  )
  assert.match(src, /parseOrderTrackFragmentToken/)
  assert.match(src, /sessionStorage/)
  assert.match(src, /history\.replaceState/)
  assert.doesNotMatch(src, /params\.get\(["']token["']\)/)
  assert.doesNotMatch(src, /ORDER_TRACK_HANDOFF_COOKIE/)
  assert.doesNotMatch(src, /tokenFromQuery/)
}

{
  const src = readFileSync(join(root, "src/middleware.ts"), "utf8")
  assert.match(src, /stripLegacyQueryTokenFromOrderTrackSearch/)
  assert.doesNotMatch(src, /ORDER_TRACK_HANDOFF_COOKIE/)
  assert.doesNotMatch(src, /encodeOrderTrackHandoff/)
  assert.match(src, /NextResponse\.redirect/)
}

{
  const src = readFileSync(
    join(root, "src/lib/order-track-token-handoff.ts"),
    "utf8"
  )
  assert.match(src, /buildGuestOrderTrackPath/)
  assert.match(src, /#token=/)
  assert.doesNotMatch(src, /ORDER_TRACK_HANDOFF_COOKIE/)
}

console.log("order-track-token-leak.fidelity: ok")
