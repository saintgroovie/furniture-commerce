/**
 * CSP connect-src builder for storefront middleware.
 * Public launch must allow canonical API origin; never demo/localhost in public mode.
 */

import {
  isDemoHostname,
  isLocalHostname,
  normalizeOrigin,
  resolveCanonicalApiOrigin,
} from "@/lib/launch-config"

export type CspConnectMode = "local" | "private_loopback" | "demo" | "public"

export function resolveCspConnectMode(
  env: NodeJS.ProcessEnv = process.env
): CspConnectMode {
  const exposure = String(env.WOODRIGHT_EXPOSURE ?? "")
    .trim()
    .toLowerCase()
  const role = String(env.WOODRIGHT_RUNTIME_ROLE ?? "")
    .trim()
    .toLowerCase()
  if (role === "public_demo" || exposure === "public" && role.includes("demo")) {
    return "demo"
  }
  if (exposure === "public" && (role === "production" || role === "")) {
    // Only when intentionally public production
    if (role === "production") return "public"
  }
  if (env.NODE_ENV !== "production") return "local"
  return "private_loopback"
}

/**
 * Extra connect-src origins beyond 'self'.
 * Same-origin rewrites cover /store on demo/private when API is proxied.
 * When browser talks to a separate API host, include that origin.
 */
export function cspConnectSrcExtras(
  env: NodeJS.ProcessEnv = process.env,
  mode: CspConnectMode = resolveCspConnectMode(env)
): string[] {
  const extras: string[] = []
  const api = resolveCanonicalApiOrigin(env)
  if (!api) return extras

  const host = new URL(api).hostname
  if (mode === "public") {
    // Exact approved production API host only - typos must not widen connect-src.
    if (
      !api.startsWith("https://") ||
      isLocalHostname(host) ||
      isDemoHostname(host) ||
      host !== "api.woodright.ru"
    ) {
      return extras
    }
    extras.push(api)
    return extras
  }

  if (mode === "demo") {
    if (isDemoHostname(host) && api.startsWith("https://")) {
      extras.push(api)
    }
    return extras
  }

  // private_loopback / local: prefer 'self' only (rewrites). Do not add localhost to CSP.
  return extras
}

export function buildConnectSrcDirective(
  env: NodeJS.ProcessEnv = process.env,
  mode?: CspConnectMode
): string {
  const parts = ["'self'", ...cspConnectSrcExtras(env, mode)]
  return `connect-src ${parts.join(" ")}`
}

/** Test helper: deny malicious / HTTP / wildcard origins for public CSP. */
export function assertSafePublicConnectOrigin(origin: string): boolean {
  const o = normalizeOrigin(origin)
  if (!o || !o.startsWith("https://")) return false
  const host = new URL(o).hostname
  if (isLocalHostname(host) || isDemoHostname(host)) return false
  if (host.includes("*")) return false
  return host === "api.woodright.ru"
}
