/**
 * Executable Next redirect policy (shared CJS helper).
 *   node src/lib/admin-app-redirects.fidelity.test.mjs
 */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { adminAppRedirects } = require("./admin-app-redirects.cjs")

const demo = adminAppRedirects({
  NEXT_PUBLIC_MEDUSA_BACKEND_URL: "https://api.woodright-demo.ru",
  NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru",
})
assert.deepEqual(demo, [
  {
    source: "/app",
    destination: "https://api.woodright-demo.ru/app",
    permanent: true,
  },
  {
    source: "/app/:path*",
    destination: "https://api.woodright-demo.ru/app/:path*",
    permanent: true,
  },
])

assert.deepEqual(
  adminAppRedirects({
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://backend:9000",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3002",
  }),
  [],
  "docker-internal backend hostname"
)

assert.deepEqual(
  adminAppRedirects({
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://medusa.internal:9000",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3002",
  }),
  [],
  "*.internal is not a browser target"
)

assert.deepEqual(
  adminAppRedirects({
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://127.0.0.1:9000",
    NEXT_PUBLIC_SITE_URL: "http://localhost:9000",
  }),
  [],
  "normalized 127.0.0.1 vs localhost must not 308-loop"
)

assert.ok(
  adminAppRedirects({
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://127.0.0.1:9000",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3002",
  }).some((r) => r.destination === "http://localhost:9000/app")
)

const nextConfig = require("node:fs").readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../next.config.js"),
  "utf8"
)
assert.match(nextConfig, /admin-app-redirects\.cjs/)

console.log("admin-app-redirects.fidelity: ok")
