"use client"

import { BespokeBadge } from "@/components/bespoke-badge"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import type { SiteSection } from "@/lib/site-section"

/**
 * One fully-painted colour variant of the route loader (wordmark + section
 * pill + track). The three variants are stacked in one grid cell and
 * cross-faded with opacity - a compositor-only recolor that stays fluid
 * while the main thread streams the destination page.
 *
 * Kids / Bespoke variants carry the header pill next to the wordmark; it
 * pops in (`loading-pill-pop`) when the stack's data-section flips to that
 * variant, so the loader replays the header lockup gesture.
 */
export function LoadingVisual({ variant }: { variant: SiteSection }) {
  return (
    <div className={`loading-visual loading-visual-${variant === "main" ? "adult" : variant}`}>
      <div className="loading-mark">
        <div className="loading-mark-art">
          <WoodrightWordmark className="loading-mark-base" />
          <WoodrightWordmark className="loading-mark-sheen" />
        </div>
        {variant === "kids" ? (
          <span className="loading-pill loading-pill-kids" aria-hidden="true">
            <span className="logo-kids-badge">Kids</span>
          </span>
        ) : null}
        {variant === "bespoke" ? (
          <span className="loading-pill loading-pill-bespoke" aria-hidden="true">
            <span className="logo-bespoke-slot">
              <BespokeBadge />
            </span>
          </span>
        ) : null}
      </div>
      <div className="loading-track">
        <span className="loading-track-bar" />
      </div>
    </div>
  )
}

/** All three variants stacked; `section` on the parent picks the visible one. */
export function LoadingVisualStack() {
  return (
    <div className="loading-stack" aria-hidden="true">
      <LoadingVisual variant="main" />
      <LoadingVisual variant="kids" />
      <LoadingVisual variant="bespoke" />
    </div>
  )
}
