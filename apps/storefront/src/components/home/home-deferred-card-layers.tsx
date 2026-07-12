"use client"

import { useEffect, useState } from "react"

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
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (variants.length === 0 && !hoverImg) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Hover still useful without motion; variants cycle is CSS-only so skip.
      if (hoverImg) setReady(true)
      return
    }

    let cancelled = false
    const arm = () => {
      if (!cancelled) setReady(true)
    }
    // Time-gated only - idle callbacks fire too early after DCL.
    const timer = window.setTimeout(arm, 2800)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [variants.length, hoverImg])

  if (!ready) return null

  return (
    <>
      {variants.slice(0, 2).map((src, vi) => (
        <img
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
        <img
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
