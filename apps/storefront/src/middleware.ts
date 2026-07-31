import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  shouldEmitXRobotsTag,
  X_ROBOTS_TAG_NOINDEX,
} from "@/lib/indexing-policy"
import { buildConnectSrcDirective } from "@/lib/csp-policy"
import { storefrontRuntimeIdentityHeaders } from "@/lib/runtime-identity-headers"
import { stripLegacyQueryTokenFromOrderTrackSearch } from "@/lib/order-track-token-handoff"

/**
 * Buyer security headers + CSP with per-request nonce.
 * Next App Router applies the middleware nonce to its bootstrap scripts when
 * the CSP header uses `'nonce-…'` + `'strict-dynamic'`.
 *
 * HSTS is set only for HTTPS requests (Traefik terminates TLS in staging).
 * Fullscreen stays allowed (gallery). COEP/COOP not enabled (external media risk).
 *
 * Demo/staging SEO: X-Robots-Tag noindex when indexing policy is fail-closed.
 *
 * Guest order track: primary token transport is URL fragment (client-only).
 * Legacy `?token=` is stripped without handoff (Option A - not supported).
 */
function applySecurityHeaders(
  request: NextRequest,
  response: NextResponse,
  nonce: string,
  csp: string
): NextResponse {
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

  for (const [k, v] of Object.entries(storefrontRuntimeIdentityHeaders())) {
    response.headers.set(k, v)
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

  // Private by default for HTML navigations that may carry guest state.
  if (request.nextUrl.pathname.startsWith("/orders/track")) {
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, max-age=0, must-revalidate"
    )
  }

  void nonce
  return response
}

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
    // Same-origin rewrites by default; public/demo may add canonical API origin.
    buildConnectSrcDirective(),
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ")

  // Option A: never consume query tokens into cookies/session. Strip only so
  // SSR/Flight cannot serialize them. First hop of a legacy bookmark may still
  // hit upstream access logs - new mint links never use query tokens.
  const strip = stripLegacyQueryTokenFromOrderTrackSearch(
    request.nextUrl.pathname,
    request.nextUrl.search
  )
  if (strip) {
    const dest = request.nextUrl.clone()
    dest.search = strip.nextSearch
    const redirect = NextResponse.redirect(dest, 307)
    return applySecurityHeaders(request, redirect, nonce, csp)
  }

  const requestHeaders = new Headers(request.headers)
  // Next 14 reads CSP from the *request* to stamp nonce on bootstrap scripts.
  requestHeaders.set("Content-Security-Policy", csp)
  requestHeaders.set("x-nonce", nonce)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  return applySecurityHeaders(request, response, nonce, csp)
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
