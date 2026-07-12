/**
 * Resolve a catalog-card sized image URL (PERF-07 / H4).
 *
 * Prefer a sibling derivative when present:
 *   /static/products/col/hero.png
 *   /product-static/products/col/hero.png   (storefront rewrite of Medusa static)
 *     → …/derivatives/card/hero.webp  (w≈720, webp)
 * Fallback: original URL (PDP / missing derivative).
 *
 * Generation + CDN are separate ops steps; this helper is the storefront
 * contract so cards can switch without rewriting every component later.
 */

const DERIVATIVE_MARKER = "/derivatives/card/"

/** Paths that map 1:1 onto on-disk `/static/products/...` assets. */
const PRODUCT_STATIC_PREFIXES = [
  "/static/products/",
  "/product-static/products/",
] as const

function matchProductStaticPrefix(
  path: string
): (typeof PRODUCT_STATIC_PREFIXES)[number] | null {
  for (const prefix of PRODUCT_STATIC_PREFIXES) {
    if (path.startsWith(prefix)) return prefix
  }
  return null
}

export function toCatalogCardDerivativePath(staticPath: string): string | null {
  const t = staticPath.trim()
  const prefix = matchProductStaticPrefix(t)
  if (!prefix) return null
  if (t.includes(DERIVATIVE_MARKER)) return t
  const lastSlash = t.lastIndexOf("/")
  if (lastSlash < 0) return null
  const dir = t.slice(0, lastSlash)
  const file = t.slice(lastSlash + 1)
  if (!file) return null
  const base = file.replace(/\.[^.]+$/, "")
  if (!base) return null
  return `${dir}/derivatives/card/${base}.webp`
}

/**
 * Pick card hero URL: derivative path when `preferDerivative` and path is
 * under `/static/products/` or `/product-static/products/`; otherwise original.
 * Absolute Medusa URLs are rewritten to relative product-static paths when
 * possible for derivative mapping.
 */
export function resolveCatalogCardImageSrc(
  src: string,
  options?: { preferDerivative?: boolean }
): string {
  const prefer = options?.preferDerivative !== false
  const t = typeof src === "string" ? src.trim() : ""
  if (!t || !prefer) return t

  let path = t
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const u = new URL(t)
      if (matchProductStaticPrefix(u.pathname)) path = u.pathname
      else if (u.pathname.startsWith("/static/products/")) path = u.pathname
      else return t
    } catch {
      return t
    }
  }

  const derivative = toCatalogCardDerivativePath(path)
  return derivative ?? t
}
