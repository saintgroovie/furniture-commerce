/**
 * RoomSet detail product thumbnails must use the shared storefront media resolver
 * so `/static/products/...` becomes buyer-facing `/product-static/products/...`.
 *
 *   node_modules/.bin/tsx src/app/rooms/room-set-detail-thumbnail-media.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { resolveStorefrontProductImageSrc } from "../../lib/product-images"

const page = readFileSync(resolve(__dirname, "[slug]/page.tsx"), "utf8")

assert.match(
  page,
  /import\s+\{\s*resolveStorefrontProductImageSrc\s*\}\s+from\s+"@\/lib\/product-images"/
)
assert.match(page, /resolveStorefrontProductImageSrc\(thumbRaw\)/)
assert.match(page, /resolveStorefrontProductImageSrc\(heroRaw\)/)
// Must not bind raw thumbnail to img src without resolver
assert.doesNotMatch(
  page,
  /src=\{thumbRaw\}/,
  "must not use unresolved thumbnail as img src"
)
assert.doesNotMatch(
  page,
  /src=\{product\.thumbnail\}/,
  "must not use product.thumbnail directly as img src"
)

const cases: Array<{ input: string; expected: string; label: string }> = [
  {
    label: "static products path",
    input: "/static/products/example.jpg",
    expected: "/product-static/products/example.jpg",
  },
  {
    label: "already product-static",
    input: "/product-static/products/example.jpg",
    expected: "/product-static/products/example.jpg",
  },
  {
    label: "https absolute non-static preserved",
    input: "https://cdn.example.com/x.jpg?w=1",
    expected: "https://cdn.example.com/x.jpg?w=1",
  },
  {
    label: "http absolute /static rewritten",
    input: "http://127.0.0.1:9000/static/products/a.jpg?x=1#frag",
    expected: "/product-static/products/a.jpg?x=1#frag",
  },
  {
    label: "query preserved on relative static",
    input: "/static/products/a.jpg?w=200&h=200",
    expected: "/product-static/products/a.jpg?w=200&h=200",
  },
  {
    label: "empty stays empty",
    input: "",
    expected: "",
  },
]

for (const c of cases) {
  const once = resolveStorefrontProductImageSrc(c.input)
  const twice = resolveStorefrontProductImageSrc(once)
  assert.equal(once, c.expected, c.label)
  assert.equal(twice, once, `idempotent: ${c.label}`)
}

// Six V1 RoomSet stored thumbnails → canonical buyer URLs
const v1Stored = [
  "/static/products/greenwich/beds-shared/GR-BED-POOL_frame_greenwich_frame_natural_beige.jpg",
  "/static/products/greenwich/GR-08-1_greenwich_white10.jpg",
  "/static/products/greenwich/GR-67-1_greenwich_white16.jpg",
  "/static/products/greenwich/GR-02-1_greenwich_white22.jpg",
]
for (const stored of v1Stored) {
  const out = resolveStorefrontProductImageSrc(stored)
  assert.match(out, /^\/product-static\/products\//)
  assert.doesNotMatch(out, /\/product-static\/product-static\//)
  assert.doesNotMatch(out, /\/product-static\/static\//)
  assert.equal(resolveStorefrontProductImageSrc(out), out)
}

// Manifest identity pin (content unchanged by this pass)
const manifest = readFileSync(
  resolve(
    __dirname,
    "../../../../backend/src/scripts/seed-rooms-v1-manifest.ts"
  ),
  "utf8"
)
assert.match(
  manifest,
  /71ef39d2699330bb2c0bca59f968bc695151b87d9ad9b7f23d9b35be0c07b67e/
)

console.log("room-set-detail-thumbnail-media.fidelity.test.ts: ok")
