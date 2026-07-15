/**
 * Full PDP photo set used for rail visibility and strip accounting.
 *
 * PDP strips are usually extras-only ({@link buildPdpThumbStripUrls}). This
 * helper expands them to unique photos: hero first, then strip URLs that are
 * not the hero. Prefer this count over raw strip length when comparing sets.
 */
export function buildPdpGalleryPhotoSet(
  mainSrc: string,
  visibleStrip: readonly string[]
): string[] {
  const main = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const rest: string[] = []
  for (const u of visibleStrip) {
    if (typeof u !== "string") continue
    const t = u.trim()
    if (!t || t === main) continue
    if (rest.includes(t)) continue
    rest.push(t)
  }
  return main ? [main, ...rest] : rest
}

/**
 * Thumb URLs passed to {@link ProductThumbCarousel}.
 *
 * Multi-photo PDP stays extras-only (no hero duplicate in the rail). Single-photo
 * SKUs still show a one-thumb gallery — operator canon; do not hide the rail.
 */
export function resolveBuyerGalleryThumbStrip(
  mainSrc: string,
  visibleStrip: readonly string[]
): string[] {
  if (visibleStrip.length > 0) return [...visibleStrip]
  const main = typeof mainSrc === "string" ? mainSrc.trim() : ""
  return main ? [main] : []
}

/** Rail is shown whenever there is at least one photo thumb. */
export function shouldShowBuyerGalleryRail(
  thumbStrip: readonly string[]
): boolean {
  return thumbStrip.length >= 1
}
