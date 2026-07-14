"use client"

import { useEffect, useState } from "react"
import { systemCopy } from "@/lib/woodright-copy"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useKidsSectionTransition } from "@/lib/use-kids-section"

/* One fully-painted color variant of the loader (wordmark + track). The
   brown and kids-green variants are stacked in the same grid cell and
   cross-faded with opacity — a compositor-only recolor, so the brown ↔
   green transition stays fluid even while the main thread is busy
   streaming the destination page (a registered-custom-property color
   tween would run on the main thread and freeze exactly then). */
function LoadingVisual({ variant }: { variant: "adult" | "kids" }) {
  return (
    <div className={`loading-visual loading-visual-${variant}`}>
      <div className="loading-mark">
        <WoodrightWordmark className="loading-mark-base" />
        <WoodrightWordmark className="loading-mark-sheen" />
      </div>
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
     fading in (appear = 0.15s delay + 0.35s). Flipping earlier hides the
     whole point: the cross-fade would play while the loader is still at
     near-zero opacity and the "from" color would never be seen. Same-
     section navigations mount settled — no false recolor. */
  const { from, target } = useKidsSectionTransition()
  const [section, setSection] = useState(from)

  useEffect(() => {
    if (section === target) return
    const timer = setTimeout(() => setSection(target), 550)
    return () => clearTimeout(timer)
  }, [section, target])

  return (
    <div
      className="system-state system-state-loading"
      data-state="loading"
      data-section={section ? "kids" : "main"}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="loading-stack" aria-hidden="true">
        <LoadingVisual variant="adult" />
        <LoadingVisual variant="kids" />
      </div>
      <p className="system-state-loading-text">{systemCopy.loading.label}</p>
    </div>
  )
}
