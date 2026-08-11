"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { HomeImg } from "./home-img"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY)
  mq.addEventListener("change", onStoreChange)
  return () => mq.removeEventListener("change", onStoreChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function getReducedMotionServerSnapshot() {
  return false
}

/**
 * Finish-variant / hover layers for product cards. Kept out of the initial
 * HTML so NetworkIdle / LCP are not blocked by multi-hundred-KB variant JPGs.
 */
export function HomeDeferredCardLayers({
  variants = [],
  hoverImg = null,
}: {
  variants?: string[]
  hoverImg?: string | null
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )
  const [deferredReady, setDeferredReady] = useState(false)

  useEffect(() => {
    if (variants.length === 0 && !hoverImg) return
    if (reducedMotion) return

    let cancelled = false
    const arm = () => {
      if (!cancelled) setDeferredReady(true)
    }
    // Time-gated only - idle callbacks fire too early after DCL.
    const timer = window.setTimeout(arm, 2800)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [variants.length, hoverImg, reducedMotion])

  const ready = reducedMotion ? Boolean(hoverImg) : deferredReady

  if (!ready) return null

  return (
    <>
      {!reducedMotion &&
        variants.slice(0, 2).map((src, vi) => (
          <HomeImg
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            className="hp-cycle-img"
            data-cycle={vi + 1}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ))}
      {hoverImg && (
        <HomeImg
          src={hoverImg}
          alt=""
          aria-hidden="true"
          className="hp-hover-img"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      )}
    </>
  )
}
