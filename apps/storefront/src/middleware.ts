import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  shouldEmitXRobotsTag,
  X_ROBOTS_TAG_NOINDEX,
} from "@/lib/indexing-policy"

/**
 * Buyer security headers + CSP with per-request nonce.
 * Next App Router applies the middleware nonce to its bootstrap scripts when
 * the CSP header uses `'nonce-…'` + `'strict-dynamic'`.
 *
 * HSTS is set only for HTTPS requests (Traefik terminates TLS in staging).
 * Fullscreen stays allowed (gallery). COEP/COOP not enabled (external media risk).
 *
 * Demo/staging SEO: X-Robots-Tag noindex when indexing policy is fail-closed.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")

  const csp = [
    "default-src 'self'",
    // Next bootstrap + JSON-LD: nonce + strict-dynamic; no unsafe-eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Next/CSS-in-JS and globals.css often need style unsafe-inline in App Router.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Same-origin /store + /product-static rewrites; no public :9000.
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ")

  const requestHeaders = new Headers(request.headers)
  // Next 14 reads CSP from the *request* to stamp nonce on bootstrap scripts.
  requestHeaders.set("Content-Security-Policy", csp)
  requestHeaders.set("x-nonce", nonce)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  response.headers.set("Content-Security-Policy", csp)
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  )
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-DNS-Prefetch-Control", "off")

  if (shouldEmitXRobotsTag()) {
    response.headers.set("X-Robots-Tag", X_ROBOTS_TAG_NOINDEX)
  }

  const proto =
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(":", "")
  if (proto === "https") {
    // No includeSubDomains / preload until owner confirms all subdomains.
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000"
    )
  }

  return response
}

export const config = {
  matcher: [
    /*
     * All routes except Next static assets and images that should stay
     * cache-friendly without CSP nonce variance on every chunk.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
