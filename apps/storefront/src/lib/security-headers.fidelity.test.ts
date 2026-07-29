/**
 * Guard: storefront security headers / CSP contract (static).
 * Live header verification is Security Closure post-deploy evidence.
 *
 *   yarn exec tsx src/lib/security-headers.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const nextConfig = read("next.config.js")
assert.match(nextConfig, /poweredByHeader:\s*false/, "poweredByHeader must be false")
assert.match(nextConfig, /async headers\s*\(/, "next.config must define headers()")
assert.doesNotMatch(
  nextConfig,
  /ignoreBuildErrors:\s*true/,
  "ignoreBuildErrors must stay absent"
)

const proxySrc = read("src/proxy.ts")
assert.match(proxySrc, /Content-Security-Policy/, "proxy must set CSP")
assert.match(
  proxySrc,
  /requestHeaders\.set\(\s*["']Content-Security-Policy["']/,
  "CSP must be set on the request for Next nonce discovery"
)
assert.match(proxySrc, /nonce-/, "CSP must use nonce")
assert.doesNotMatch(proxySrc, /'unsafe-eval'/, "CSP must not allow unsafe-eval")
assert.match(proxySrc, /Strict-Transport-Security/, "proxy must set HSTS on HTTPS")
assert.match(proxySrc, /X-Content-Type-Options/, "proxy must set nosniff")
assert.match(proxySrc, /frame-ancestors 'none'/, "CSP frame-ancestors none")
assert.match(proxySrc, /X-Robots-Tag/, "proxy must set X-Robots-Tag under noindex policy")
assert.match(
  proxySrc,
  /storefrontRuntimeIdentityHeaders/,
  "proxy must attach runtime identity headers"
)
const identityLib = read("src/lib/runtime-identity-headers.ts")
assert.match(identityLib, /WOODRIGHT_DATABASE_IDENTITY/)
assert.match(identityLib, /x-woodright-database-identity/)
assert.doesNotMatch(identityLib, /NEXT_PUBLIC_WOODRIGHT/)
assert.doesNotMatch(
  proxySrc,
  /fullscreen=\(\)/,
  "do not disable fullscreen (PDP gallery)"
)

const session = read("src/lib/cart/session.ts")
assert.match(session, /Secure/, "cart_id cookie must set Secure on HTTPS")

const layout = read("src/app/layout.tsx")
assert.match(layout, /headers\(\)/, "layout must read nonce from headers()")
assert.match(layout, /nonce=\{nonce\}/, "JSON-LD script must carry CSP nonce")
assert.match(layout, /CspNonceProvider/, "layout must provide CSP nonce to clients")

for (const rel of [
  "src/components/catalog-filter-controls.tsx",
  "src/components/catalog-browse-client.tsx",
  "src/app/product/[id]/page.tsx",
]) {
  const src = read(rel)
  assert.match(src, /nonce=\{/, `${rel} must attach CSP nonce to inline script`)
}

console.log("security-headers.fidelity: ok")
