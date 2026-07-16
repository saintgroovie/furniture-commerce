/**
 * Canonical PDP photo set: hero first, then unique extras.
 *
 * Counter, thumbnails, swipe, and fullscreen must all use this list so
 * `N фото` always matches N selectable frames and the primary frame is
 * reachable with one click on the first thumb.
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
 * Thumb URLs for {@link ProductThumbCarousel}.
 *
 * Always the full canonical photo set (hero included). Extras-only rails made
 * return-to-primary require a second click on the active extra.
 */
export function resolveBuyerGalleryThumbStrip(
  mainSrc: string,
  visibleStrip: readonly string[]
): string[] {
  return buildPdpGalleryPhotoSet(mainSrc, visibleStrip)
}

/** Rail is shown whenever there is at least one photo thumb. */
export function shouldShowBuyerGalleryRail(
  thumbStrip: readonly string[]
): boolean {
  return thumbStrip.length >= 1
}
