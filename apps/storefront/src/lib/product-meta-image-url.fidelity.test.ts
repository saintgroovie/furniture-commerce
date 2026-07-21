/**
 * OG / metadata image URL contract: never emit environment-specific origins.
 *
 *   cd apps/storefront && npx tsx src/lib/product-meta-image-url.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  resolveProductPrimaryImageForMeta,
  resolveStorefrontProductImageSrc,
} from "./product-images"

const FORBIDDEN = [
  "http://localhost",
  "https://localhost",
  "http://127.0.0.1",
  "https://127.0.0.1",
  "http://89.169.188.29",
  "https://89.169.188.29",
  "http://api.woodright-demo.ru",
  "ws://",
]

function assertNoForbidden(label: string, value: string) {
  for (const bad of FORBIDDEN) {
    assert.equal(
      value.includes(bad),
      false,
      `${label} must not contain ${bad}; got ${value}`
    )
  }
}

{
  const out = resolveProductPrimaryImageForMeta("/static/products/a/main.jpg")
  assert.equal(out, "/product-static/products/a/main.jpg")
  assertNoForbidden("relative static", out!)
}

{
  const out = resolveProductPrimaryImageForMeta(
    "http://localhost:9000/static/products/a/main.jpg"
  )
  assert.equal(out, "/product-static/products/a/main.jpg")
  assertNoForbidden("localhost absolute", out!)
}

{
  const out = resolveProductPrimaryImageForMeta(
    "https://api.woodright-demo.ru/static/products/a/main.jpg?v=2"
  )
  assert.equal(out, "/product-static/products/a/main.jpg?v=2")
  assertNoForbidden("https api static", out!)
}

{
  const out = resolveProductPrimaryImageForMeta("https://cdn.example.com/external.jpg")
  assert.equal(out, "https://cdn.example.com/external.jpg")
}

{
  assert.equal(resolveProductPrimaryImageForMeta(undefined), undefined)
  assert.equal(resolveProductPrimaryImageForMeta("   "), undefined)
}

{
  const out = resolveStorefrontProductImageSrc("/product-static/products/a/x.jpg")
  assert.equal(out, "/product-static/products/a/x.jpg")
  assert.equal(out.includes("/product-static/product-static/"), false)
}

{
  const encoded = resolveStorefrontProductImageSrc(
    "http://localhost:9000/static/products/a/foo%20bar.jpg"
  )
  assert.equal(encoded, "/product-static/products/a/foo%20bar.jpg")
  assertNoForbidden("encoded", encoded)
}

console.log("product-meta-image-url.fidelity.test.ts: ok")
