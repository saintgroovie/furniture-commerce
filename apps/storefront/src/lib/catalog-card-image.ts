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
 * Map of catalog-card display URL → storefront original.
 * When a speculative `/derivatives/card/*.webp` 404s, UI must swap to the
 * original JPEG/PNG instead of treating the photo as missing.
 */
export type CatalogCardDerivativeFallbackBySrc = Readonly<
  Record<string, string>
>

export type CatalogCardMediaBundle = {
  mainSrc: string
  extraSrcs: string[]
  /** display (often webp derivative) → storefront original; empty when flag off */
  fallbackBySrc: CatalogCardDerivativeFallbackBySrc
}

function recordDerivativeFallback(
  out: Record<string, string>,
  display: string,
  original: string
): void {
  const d = display.trim()
  const o = original.trim()
  if (!d || !o || d === o) return
  out[d] = o
}

/**
 * Recover the sibling original path when `src` is already a card WebP derivative
 * (e.g. after product-card pre-resolved URLs and gallery core resolves again).
 * Catalog assets are overwhelmingly `.jpg`; `.png` is tried by the thumb/hero
 * error path when the jpg sibling 404s via optional secondary candidates.
 */
export function catalogCardOriginalFromDerivative(src: string): string | null {
  let t = typeof src === "string" ? src.trim() : ""
  if (!t) return null
  try {
    t = decodeURIComponent(t)
  } catch {
    // keep raw
  }
  let path = t
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      path = new URL(t).pathname
    } catch {
      return null
    }
  }
  if (!path.includes(DERIVATIVE_MARKER)) return null
  const restored = path.replace(/\/derivatives\/card\//i, "/")
  if (/\.webp$/i.test(restored)) {
    return restored.replace(/\.webp$/i, ".jpg")
  }
  return restored
}

/** Secondary original candidates after the primary jpg recovery fails. */
export function catalogCardOriginalFallbackCandidates(src: string): string[] {
  const primary = catalogCardOriginalFromDerivative(src)
  if (!primary) return []
  const out = [primary]
  if (/\.jpg$/i.test(primary)) {
    out.push(primary.replace(/\.jpg$/i, ".jpeg"), primary.replace(/\.jpg$/i, ".png"))
  }
  return out
}

/**
 * Resolve every URL used by a catalog execution switch (hero + thumb strip).
 *
 * Without this, the initial card uses a ~10 KB WebP derivative but a swatch
 * click jumps back to the ~300 KB source JPEG. That causes two competing hero
 * requests because the card-quality effect immediately rewrites it back to the
 * derivative. Keep PDP media untouched by calling this helper only for cards.
 *
 * Derivatives are optional. Callers must fall back via `fallbackBySrc` on
 * image error — never blacklist a photo solely because its WebP is missing.
 */
export function resolveCatalogCardMediaBundle(
  mainSrc: string,
  extraSrcs: readonly string[],
  resolveStorefront: (url: string) => string
): CatalogCardMediaBundle {
  const fallbackBySrc: Record<string, string> = {}
  const mainOriginalRaw = resolveStorefront(mainSrc)
  const mainDisplay = resolveCatalogCardHeroSrc(mainSrc, resolveStorefront)
  const mainOriginal =
    mainDisplay !== mainOriginalRaw
      ? mainOriginalRaw
      : catalogCardOriginalFromDerivative(mainDisplay) ?? mainOriginalRaw
  recordDerivativeFallback(fallbackBySrc, mainDisplay, mainOriginal)

  const resolvedExtras: string[] = []
  for (const url of extraSrcs) {
    const originalRaw = resolveStorefront(url)
    const display = resolveCatalogCardHeroSrc(url, resolveStorefront)
    const original =
      display !== originalRaw
        ? originalRaw
        : catalogCardOriginalFromDerivative(display) ?? originalRaw
    recordDerivativeFallback(fallbackBySrc, display, original)
    resolvedExtras.push(display)
  }

  return {
    mainSrc: mainDisplay,
    extraSrcs: resolvedExtras,
    fallbackBySrc,
  }
}
