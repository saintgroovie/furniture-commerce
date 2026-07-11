/**
 * PDP gallery builder core (Node/fs via backend). Used by server page + operator scripts.
 * Client components must import `pdp-buyer-gallery.server.ts` only from Server Components.
 */
import { collapseBuyerGalleryUrls, sortUrlsByBuyerPolicy } from "../../../backend/src/lib/gallery-buyer-sort"
import {
  prepareOliverBuyerGallery,
  prepareOliverBuyerGalleryHashOnly,
} from "../../../backend/src/lib/gallery-content-dedupe"
import {
  collectProductImageUrls,
  isOliverMultiColorProduct,
} from "./oliver-buyer-gallery"

function mainSrcMatchesUrl(mainNorm: string, url: string): boolean {
  if (!mainNorm) return false
  if (url === mainNorm) return true
  const base = (u: string) => (u.split("/").pop() ?? u).toLowerCase()
  return base(url) === base(mainNorm)
}

/**
 * Oliver PDP: backend workbook repair (MD5, Pattern A/B).
 * Medusa `images[]` is source of truth after batch apply; re-syncs order/roles at render.
 */
export function buildPdpBuyerFacingGallery(product: Record<string, unknown>): {
  mainSrc: string
  extraSrcs: string[]
} {
  const handle = typeof product.handle === "string" ? product.handle : undefined
  const raw = collectProductImageUrls(product)
  const isOliver = handle?.toLowerCase().startsWith("ol-")
  const collapsed = isOliver
    ? isOliverMultiColorProduct(product)
      ? prepareOliverBuyerGalleryHashOnly(raw, handle!, sortUrlsByBuyerPolicy)
      : prepareOliverBuyerGallery(raw, handle!, collapseBuyerGalleryUrls)
    : collapseBuyerGalleryUrls(raw, { handle })
  const mainSrc = collapsed[0] ?? ""
  const mainNorm = mainSrc.trim()
  const extraSrcs = collapsed.slice(1).filter((u) => !mainSrcMatchesUrl(mainNorm, u))
  return { mainSrc: mainNorm, extraSrcs }
}
