/**
 * Oliver PDP thumb strip: always hero-first + unique extras (same as buyer
 * photo set). color_hero + gallery_01 pairs stay both frames selectable.
 */
import { buildGalleryStripUrls } from "./product-images"

export function buildOliverPdpThumbStripUrls(mainSrc: string, extraSrcs: string[]): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const extras = extraSrcs.map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean)
  return buildGalleryStripUrls(mainNorm, extras)
}
