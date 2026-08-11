import { resolveCatalogCardHeroSrc } from "@/lib/catalog-card-image"

/**
 * Homepage / kids-landing image surface contract (Option B).
 *
 * CATALOG_CARD keeps Phase H4 card WebP (720 / q78).
 * Premium full-bleed / lifestyle surfaces always resolve to the original asset.
 * PDP is out of scope (never uses this resolver).
 */
export const HOME_IMAGE_SURFACES = [
  "CATALOG_CARD",
  "ROOM_COMPOSITION",
  "HOME_HERO",
  "KIDS_HERO",
  "LIFESTYLE_BLOCK",
  "LARGE_CTA",
] as const

export type HomeImageSurface = (typeof HOME_IMAGE_SURFACES)[number]

/** Surfaces that must never prefer catalog-card derivatives. */
export const PREMIUM_ORIGINAL_SURFACES: ReadonlySet<HomeImageSurface> = new Set([
  "ROOM_COMPOSITION",
  "HOME_HERO",
  "KIDS_HERO",
  "LIFESTYLE_BLOCK",
  "LARGE_CTA",
])

export function homeImageSurfaceUsesCardDerivative(
  surface: HomeImageSurface = "CATALOG_CARD"
): boolean {
  return !PREMIUM_ORIGINAL_SURFACES.has(surface)
}

export type ResolveHomeImageSrcOptions = {
  surface?: HomeImageSurface
}

/**
 * Server-safe homepage image URL.
 * - `CATALOG_CARD` (default): catalog-card WebP when
 *   `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1`, otherwise original.
 * - Premium surfaces: always original path (no card derivative).
 * UI must still fall back via {@link HomeImg} onError if a derivative 404s.
 */
export function resolveHomeImageSrc(
  src: string,
  options?: ResolveHomeImageSrcOptions
): string {
  const t = typeof src === "string" ? src.trim() : ""
  if (!t) return t
  const surface = options?.surface ?? "CATALOG_CARD"
  if (!homeImageSurfaceUsesCardDerivative(surface)) return t
  return resolveCatalogCardHeroSrc(t, (url) => url)
}
