/**
 * Bare demo/loopback host tokens shared by indexing + launch contract.
 * Keep scheme-qualified demo origins OUT of this module so production_candidate
 * buyer routes (robots/sitemap) never bundle scheme-qualified demo origins.
 */

/** woodright-demo.ru and its known subdomains - never a valid production-like host. */
export const DEMO_HOSTS = [
  "woodright-demo.ru",
  "www.woodright-demo.ru",
  "api.woodright-demo.ru",
] as const

export const LOOPBACK_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?$/i

/**
 * Canonical buyer hosts for `public_demo` image/runtime builds.
 * Exact allowlist only - never substring / wildcard matching.
 */
export const PUBLIC_DEMO_BUYER_HOSTS = ["woodright-demo.ru", "www.woodright-demo.ru"] as const
