/**
 * URL contract: internal Medusa upstream + same-origin media surfaces.
 *
 *   cd apps/storefront && ../backend/node_modules/.bin/tsx src/lib/medusa-backend-url-contract.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { resolvePdpMediaSrc } from "./product-images"

const require = createRequire(__filename)
const {
  resolveMedusaBackendInternalUrl,
} = require("../../medusa-backend-internal-url.cjs") as {
  resolveMedusaBackendInternalUrl: (env?: NodeJS.ProcessEnv) => string
}

{
  const url = resolveMedusaBackendInternalUrl({
    NODE_ENV: "production",
    MEDUSA_BACKEND_INTERNAL_URL: "http://backend:9000",
    MEDUSA_BACKEND_URL: "http://localhost:9000",
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://89.169.188.29:9000",
  })
  assert.equal(url, "http://backend:9000")
}

{
  assert.throws(
    () =>
      resolveMedusaBackendInternalUrl({
        NODE_ENV: "production",
        MEDUSA_BACKEND_URL: "http://89.169.188.29:9000",
      }),
    /not a public IP|allowlist|Unsafe/
  )
}

{
  // Loopback IPv4 must not be rejected by the dotted-quad public-IP guard.
  assert.equal(
    resolveMedusaBackendInternalUrl({
      NODE_ENV: "production",
      MEDUSA_BACKEND_URL: "http://127.0.0.1:9019",
    }),
    "http://127.0.0.1:9019"
  )
}

{
  assert.throws(
    () =>
      resolveMedusaBackendInternalUrl({
        NODE_ENV: "production",
      }),
    /Missing MEDUSA_BACKEND/
  )
}

{
  assert.equal(
    resolveMedusaBackendInternalUrl({ NODE_ENV: "development" }),
    "http://localhost:9000"
  )
}

{
  assert.throws(
    () =>
      resolveMedusaBackendInternalUrl({
        NODE_ENV: "production",
        MEDUSA_BACKEND_INTERNAL_URL: "http://evil.example:9000",
      }),
    /allowlist/
  )
}

{
  const src = resolvePdpMediaSrc("/static/products/a/main.jpg")
  assert.equal(src, "/product-static/products/a/main.jpg")
  assert.equal(src.includes("89.169.188.29"), false)
  assert.equal(src.includes(":9000"), false)
}

{
  const src = resolvePdpMediaSrc(
    "http://89.169.188.29:9000/static/products/a/main.jpg?v=1#x"
  )
  assert.equal(src, "/product-static/products/a/main.jpg?v=1#x")
}

{
  const src = resolvePdpMediaSrc("/uploads/foo.jpg")
  assert.equal(src, "/uploads/foo.jpg")
  assert.equal(src.includes("89.169.188.29"), false)
}

console.log("medusa-backend-url-contract.fidelity.test.ts: ok")
