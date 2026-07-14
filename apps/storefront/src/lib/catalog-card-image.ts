/**
 * Resolve a catalog-card sized image URL (PERF-07 / H4).
 *
 * Prefer a sibling derivative when env-enabled:
 *   /static/products/col/hero.png
 *   /product-static/products/col/hero.png   (storefront rewrite of Medusa static)
 *     → …/derivatives/card/hero.webp  (w≈720, webp)
 *
 * Missing derivatives are not auto-detected (no HEAD). Generate before enabling
 * the flag; card hero `onError` remains the UI safety net.
 *
 * Enable with `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1` via
 * {@link resolveCatalogCardHeroSrc}. Generation: backend
 * `yarn generate:catalog-card-derivatives`.
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

export function catalogCardDerivativesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES === "1"
}

export function toCatalogCardDerivativePath(staticPath: string): string | null {
  let t = staticPath.trim()
  try {
    // Thumbnails may arrive percent-encoded (e.g. Cyrillic filenames).
    t = decodeURIComponent(t)
  } catch {
    // keep raw
  }
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
 */
export function resolveCatalogCardImageSrc(
  src: string,
  options?: { preferDerivative?: boolean }
): string {
  const prefer = options?.preferDerivative === true
  const t = typeof src === "string" ? src.trim() : ""
  if (!t || !prefer) return t

  let path = t
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const u = new URL(t)
      let pathname = u.pathname
      try {
        pathname = decodeURIComponent(pathname)
      } catch {
        // keep encoded pathname
      }
      if (matchProductStaticPrefix(pathname)) path = pathname
      else if (pathname.startsWith("/static/products/")) path = pathname
      else return t
    } catch {
      return t
    }
  }

  const derivative = toCatalogCardDerivativePath(path)
  return derivative ?? t
}

/**
 * Catalog-card hero resolver: storefront rewrite first, then optional card WebP.
 * PDP must keep using resolveStorefrontProductImageSrc unchanged.
 */
export function resolveCatalogCardHeroSrc(
  src: string,
  resolveStorefront: (url: string) => string
): string {
  const storefront = resolveStorefront(src)
  if (!catalogCardDerivativesEnabled()) return storefront
  return resolveCatalogCardImageSrc(storefront, { preferDerivative: true })
}

/**
 * Resolve every URL used by a catalog execution switch (hero + thumb strip).
 *
 * Without this, the initial card uses a ~10 KB WebP derivative but a swatch
 * click jumps back to the ~300 KB source JPEG. That causes two competing hero
 * requests because the card-quality effect immediately rewrites it back to the
 * derivative. Keep PDP media untouched by calling this helper only for cards.
 */
export function resolveCatalogCardMediaBundle(
  mainSrc: string,
  extraSrcs: readonly string[],
  resolveStorefront: (url: string) => string
): { mainSrc: string; extraSrcs: string[] } {
  return {
    mainSrc: resolveCatalogCardHeroSrc(mainSrc, resolveStorefront),
    extraSrcs: extraSrcs.map((url) =>
      resolveCatalogCardHeroSrc(url, resolveStorefront)
    ),
  }
}
