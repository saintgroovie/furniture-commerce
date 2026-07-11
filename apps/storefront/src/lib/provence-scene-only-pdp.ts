/**
 * Browser-safe Provence scene-only PDP extras filter (mirrors backend canonical gallery).
 */
import { galleryImageBasenameKey } from "./product-images"
import { hasProvencePaintWoodDualFinishEvidence } from "./provence-finish-execution-guard"
import { collectProductImageUrls } from "./collect-product-image-urls"

function filterProvenceSkuNativeBasenames(urls: string[], handle: string): string[] {
  const h = handle.toLowerCase()
  const core = h.slice(3).replace(/-/g, "[-_]")
  const anchored = new RegExp(`(?:^|[^a-z0-9])pv[-_]?${core}(?:[^a-z0-9]|$)`, "i")
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    const b = galleryImageBasenameKey(u)
    if (!anchored.test(b)) continue
    if (seen.has(b)) continue
    seen.add(b)
    out.push(b)
  }
  return out
}

function isHandleMainBasename(basename: string, handle: string): boolean {
  const h = handle.toLowerCase()
  const core = h.slice(3).replace(/-/g, "[-_]")
  return new RegExp(`^pv[-_]?${core}[-_]main(?:\\.|[-_]|$)`, "i").test(basename)
}

/** Drop redundant handle `main` thumb when hero is scene `i1` and gallery is exactly i1+main (pv-55-2 class). */
export function filterProvenceSceneOnlyPdpExtras(
  product: Record<string, unknown>,
  mainSrc: string,
  extraSrcs: string[]
): string[] {
  const handle = String(product.handle ?? "").toLowerCase()
  if (!handle.startsWith("pv-")) return extraSrcs
  const meta = product.metadata as Record<string, unknown> | undefined
  if (meta?.finish_metadata_source === "provence_paint_wood_split") return extraSrcs

  const productUrls = collectProductImageUrls(product)
  if (hasProvencePaintWoodDualFinishEvidence(productUrls, handle)) return extraSrcs

  const mainKey = galleryImageBasenameKey(mainSrc)
  if (!/[-_]i0?1(?:\.|[-_]|$)/i.test(mainKey)) return extraSrcs

  const nativeNames = filterProvenceSkuNativeBasenames(productUrls, handle)
  const hasGallery = nativeNames.some((b) => /gallery[_\-.]?\d+/i.test(b))
  const hasI1 = nativeNames.some((b) => /[-_]i0?1(?:\.|[-_]|$)/i.test(b))
  const hasMain = nativeNames.some((b) => isHandleMainBasename(b, handle))
  if (hasGallery || nativeNames.length !== 2 || !hasI1 || !hasMain) return extraSrcs

  return extraSrcs.filter((u) => !isHandleMainBasename(galleryImageBasenameKey(u), handle))
}
