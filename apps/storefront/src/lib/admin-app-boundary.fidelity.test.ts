/**
 * Storefront must send /app to Medusa origin, never render Admin on buyer host.
 *
 *   yarn exec tsx src/lib/admin-app-boundary.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  isBrowserSafeAdminOrigin,
  isMedusaAdminStorefrontPath,
  resolveAdminAppRedirectUrl,
} from "./admin-app-boundary"

assert.equal(isMedusaAdminStorefrontPath("/app"), true)
assert.equal(isMedusaAdminStorefrontPath("/app/login"), true)
assert.equal(isMedusaAdminStorefrontPath("/app/woodright/catalog-promo"), true)
assert.equal(isMedusaAdminStorefrontPath("/apple-touch-icon.png"), false)
assert.equal(isMedusaAdminStorefrontPath("/catalog"), false)
assert.equal(isMedusaAdminStorefrontPath("/about"), false)

assert.equal(
  resolveAdminAppRedirectUrl({
    pathname: "/app/login",
    search: "",
    siteOrigin: "https://woodright-demo.ru",
    adminOrigin: "https://api.woodright-demo.ru",
  }),
  "https://api.woodright-demo.ru/app/login"
)

assert.equal(
  resolveAdminAppRedirectUrl({
    pathname: "/app",
    search: "?x=1",
    siteOrigin: "http://localhost:3002",
    adminOrigin: "http://127.0.0.1:9000",
  }),
  "http://localhost:9000/app?x=1"
)

assert.equal(
  resolveAdminAppRedirectUrl({
    pathname: "/app",
    siteOrigin: "https://api.woodright-demo.ru",
    adminOrigin: "https://api.woodright-demo.ru",
  }),
  null,
  "same origin must not redirect-loop"
)

assert.equal(
  resolveAdminAppRedirectUrl({
    pathname: "/app",
    siteOrigin: "https://woodright-demo.ru",
    adminOrigin: "http://backend:9000",
  }),
  null,
  "docker-internal backend hostname is not a browser target"
)

assert.equal(
  resolveAdminAppRedirectUrl({
    pathname: "/catalog",
    siteOrigin: "https://woodright-demo.ru",
    adminOrigin: "https://api.woodright-demo.ru",
  }),
  null
)

assert.equal(
  isBrowserSafeAdminOrigin(new URL("https://api.woodright-demo.ru")),
  true
)
assert.equal(isBrowserSafeAdminOrigin(new URL("http://backend:9000")), false)
assert.equal(isBrowserSafeAdminOrigin(new URL("http://medusa.internal:9000")), false)

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8")
assert.match(proxy, /resolveAdminAppRedirectUrl/)
assert.match(proxy, /NEXT_PUBLIC_MEDUSA_BACKEND_URL/)
assert.doesNotMatch(
  proxy,
  /MEDUSA_BACKEND_INTERNAL_URL/,
  "browser Admin redirect must not use Docker-internal Medusa URL"
)

const nextConfig = readFileSync(join(root, "next.config.js"), "utf8")
assert.match(nextConfig, /admin-app-redirects\.cjs/)
assert.match(nextConfig, /adminAppRedirects/)
assert.doesNotMatch(
  nextConfig,
  /function adminAppRedirects/,
  "next.config must not keep a weaker inline redirect helper"
)

console.log("admin-app-boundary.fidelity: ok")
