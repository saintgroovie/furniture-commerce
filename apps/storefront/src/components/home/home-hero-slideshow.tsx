"use client"

import { useEffect, useState } from "react"
import { HomeImg } from "./home-img"
import type { HomeImageSurface } from "./home-image"

export type HeroSlide = { src: string; alt: string }

/**
 * All slides stay in the DOM so the CSS cross-fade timeline stays synced to
 * page load. Only slide 0 gets `src` on first paint; later slides receive
 * `src` after a short delay so their multi-hundred-KB JPGs stay off the
 * critical path without blanking the hero mid-cycle.
 *
 * Premium hero surfaces keep original assets (Option B); do not use card WebP.
 */
export function HomeHeroSlideshow({
  slides,
  surface = "HOME_HERO",
}: {
  slides: readonly HeroSlide[]
  surface?: Extract<HomeImageSurface, "HOME_HERO" | "KIDS_HERO">
}) {
  const [extrasReady, setExtrasReady] = useState(false)

  useEffect(() => {
    if (slides.length < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) setExtrasReady(true)
    }, 4000)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [slides.length])

  return (
    <>
      {slides.map((slide, i) => {
        const showSrc = i === 0 || extrasReady
        return (
          <HomeImg
            key={slide.src}
            src={showSrc ? slide.src : undefined}
            surface={surface}
            alt={i === 0 ? slide.alt : ""}
            aria-hidden={i === 0 ? undefined : true}
            className="hp-hero-img"
            data-slide={i}
            fetchPriority={i === 0 ? "high" : undefined}
            decoding="async"
            draggable={false}
          />
        )
      })}
    </>
  )
}
