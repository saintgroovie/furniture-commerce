import { resolveCatalogCardHeroSrc } from "@/lib/catalog-card-image"

/**
 * Server-safe homepage image URL: catalog-card WebP when
 * `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1`, otherwise the original path.
 * UI must still fall back via {@link HomeImg} onError if a derivative 404s.
 */
export function resolveHomeImageSrc(src: string): string {
  const t = typeof src === "string" ? src.trim() : ""
  if (!t) return t
  return resolveCatalogCardHeroSrc(t, (url) => url)
}
