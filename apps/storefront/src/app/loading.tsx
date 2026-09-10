"use client"

import { useEffect, useState } from "react"
import { BespokeBadge } from "@/components/bespoke-badge"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { systemCopy } from "@/lib/woodright-copy"
import {
  useKidsEnterOnLoadingAppear,
  useSiteSectionTransition,
  type SiteSection,
} from "@/lib/use-site-section"

/* One fully-painted color variant of the loader (wordmark + track).
   Variants are stacked in the same grid cell and cross-faded with opacity
   — a compositor-only recolor, so the transition stays fluid even while
   the main thread is busy streaming the destination page. */
function LoadingVisual({ variant }: { variant: SiteSection }) {
  return (
    <div className={`loading-visual loading-visual-${variant === "main" ? "adult" : variant}`}>
      <div className="loading-mark">
        <WoodrightWordmark className="loading-mark-base" />
        <WoodrightWordmark className="loading-mark-sheen" />
      </div>
      {variant === "bespoke" ? (
        <div className="loading-bespoke-capsule" aria-hidden="true">
          <span className="logo-bespoke-slot">
            <BespokeBadge />
          </span>
        </div>
      ) : null}
      <div className="loading-track">
        <span className="loading-track-bar" />
      </div>
    </div>
  )
}

export default function Loading() {
  /* Mounts showing the section the user is leaving (`from` is captured at
     link-click time, while the URL is still the old one) and flips
     data-section to the destination once the loader itself has finished
     fading in (appear = 0.15s delay + 0.35s). Same-section navigations
     mount settled — no false recolor. */
  const { from, target } = useSiteSectionTransition()
  const [section, setSection] = useState<SiteSection>(from)
  /* Kids catalog → PDP: start KIDS enter with this loader's appear delay
     (not on the catalog click). */
  useKidsEnterOnLoadingAppear()

  /* Kids catalog → PDP can briefly lose optimistic context before the
     product bridge settles. If both from+target say kids, never paint
     the adult (brown) loader — adopt kids immediately. Do not sync the
     adult→kids cross-fade case (from !== target). */
  useEffect(() => {
    if (from === "kids" && target === "kids" && section !== "kids") {
      setSection("kids")
    }
  }, [from, target, section])

  useEffect(() => {
    if (section === target) return
    const timer = setTimeout(() => setSection(target), 550)
    return () => clearTimeout(timer)
  }, [section, target])

  return (
    <div
      className="system-state system-state-loading"
      data-state="loading"
      data-section={section}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="loading-stack" aria-hidden="true">
        <LoadingVisual variant="main" />
        <LoadingVisual variant="kids" />
        <LoadingVisual variant="bespoke" />
      </div>
      <p className="system-state-loading-text">{systemCopy.loading.label}</p>
    </div>
  )
}
