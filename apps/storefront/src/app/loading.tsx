"use client"

import { useEffect, useRef } from "react"
import { systemCopy } from "@/lib/woodright-copy"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import {
  useKidsEnterOnLoadingAppear,
  useKidsSectionTransition,
} from "@/lib/use-kids-section"

/* One fully-painted color variant of the loader (wordmark + track). The
   brown and kids-green variants are stacked in the same grid cell and
   cross-faded with opacity - a compositor-only recolor, so the brown ↔
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
     fading in (appear = 0.15s delay + 0.35s). Delayed flip uses a DOM
     attribute write (not React state) so timing stays intact without
     setState-in-effect. */
  const { from, target } = useKidsSectionTransition()
  const rootRef = useRef<HTMLDivElement>(null)
  useKidsEnterOnLoadingAppear()

  const initialKids = Boolean(from && target) || Boolean(from)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    if (from === target) {
      el.dataset.section = target ? "kids" : "main"
      return
    }
    const timer = window.setTimeout(() => {
      el.dataset.section = target ? "kids" : "main"
    }, 550)
    return () => window.clearTimeout(timer)
  }, [from, target])

  return (
    <div
      ref={rootRef}
      className="system-state system-state-loading"
      data-state="loading"
      data-section={initialKids ? "kids" : "main"}
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
