/**
 * Oliver PDP thumb strip: color_hero + gallery_01 pair shows both frames (hero + detail).
 * Other SKUs: extras-only strip (hero already in hero slot). Return-to-main via
 * re-click on the active extra — do not prepend hero on every Oliver PDP (duplicate).
 */
import { detectOliverGalleryColorHeroPair } from "./oliver-finish-execution-guard"
import { buildGalleryStripUrls, buildPdpThumbStripUrls } from "./product-images"

export function buildOliverPdpThumbStripUrls(
  mainSrc: string,
  extraSrcs: string[]
): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const extras = extraSrcs
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean)
  const pairUrls = [mainNorm, ...extras].filter(Boolean)
  if (detectOliverGalleryColorHeroPair(pairUrls)) {
    return buildGalleryStripUrls(mainNorm, extras)
  }
  return buildPdpThumbStripUrls(mainNorm, extras)
}
