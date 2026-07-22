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

const middleware = read("src/middleware.ts")
assert.match(middleware, /Content-Security-Policy/, "middleware must set CSP")
assert.match(
  middleware,
  /requestHeaders\.set\(\s*["']Content-Security-Policy["']/,
  "CSP must be set on the request for Next nonce discovery"
)
assert.match(middleware, /nonce-/, "CSP must use nonce")
assert.doesNotMatch(middleware, /'unsafe-eval'/, "CSP must not allow unsafe-eval")
assert.match(middleware, /Strict-Transport-Security/, "middleware must set HSTS on HTTPS")
assert.match(middleware, /X-Content-Type-Options/, "middleware must set nosniff")
assert.match(middleware, /frame-ancestors 'none'/, "CSP frame-ancestors none")
assert.match(middleware, /X-Robots-Tag/, "middleware must set X-Robots-Tag under noindex policy")
assert.doesNotMatch(
  middleware,
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
