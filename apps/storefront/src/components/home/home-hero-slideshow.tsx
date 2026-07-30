"use client"

import { useEffect, useRef, useState } from "react"
import { HomeImg } from "./home-img"
import {
  resolveHomeImageSrc,
  type HomeImageSurface,
} from "./home-image"

export type HeroSlide = { src: string; alt: string }

const CROSSFADE_MS = 420
const HOLD_MS = 7000

/**
 * Double-buffer hero slideshow.
 *
 * After the first image is visible, the current slide stays at full opacity
 * until the next slide is loaded + decoded. Only then a short crossfade runs.
 * The plate background must never become the only visible layer mid-cycle.
 */
export function HomeHeroSlideshow({
  slides,
  surface = "HOME_HERO",
}: {
  slides: readonly HeroSlide[]
  surface?: Extract<HomeImageSurface, "HOME_HERO" | "KIDS_HERO">
}) {
  const [active, setActive] = useState(0)
  const [incoming, setIncoming] = useState<number | null>(null)
  const [fading, setFading] = useState(false)
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0]))
  const genRef = useRef(0)

  useEffect(() => {
    if (slides.length < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let cancelled = false
    let holdTimer: number | undefined
    let fadeTimer: number | undefined

    const clearTimers = () => {
      if (holdTimer !== undefined) window.clearTimeout(holdTimer)
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer)
    }

    const markLoaded = (index: number) => {
      setLoaded((prev) => {
        if (prev.has(index)) return prev
        const next = new Set(prev)
        next.add(index)
        return next
      })
    }

    const preload = async (index: number, token: number) => {
      const raw = slides[index]?.src
      if (!raw) return false
      const src = resolveHomeImageSrc(raw, { surface })
      try {
        const img = new window.Image()
        img.decoding = "async"
        img.src = src
        if (typeof img.decode === "function") {
          await img.decode()
        } else {
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error("hero image load failed"))
          })
        }
        if (cancelled || token !== genRef.current) return false
        markLoaded(index)
        return true
      } catch {
        return false
      }
    }

    const scheduleNext = (from: number) => {
      clearTimers()
      holdTimer = window.setTimeout(() => {
        void advance(from)
      }, HOLD_MS)
    }

    const advance = async (from: number) => {
      if (cancelled) return
      const token = ++genRef.current
      const total = slides.length
      let tries = 0
      let next = (from + 1) % total

      while (tries < total) {
        if (next === from) break
        const ok = await preload(next, token)
        if (cancelled || token !== genRef.current) return
        if (ok) {
          setIncoming(next)
          setFading(false)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (cancelled || token !== genRef.current) return
              setFading(true)
              fadeTimer = window.setTimeout(() => {
                if (cancelled || token !== genRef.current) return
                setActive(next)
                setIncoming(null)
                setFading(false)
                scheduleNext(next)
              }, CROSSFADE_MS)
            })
          })
          return
        }
        tries += 1
        next = (next + 1) % total
      }
      scheduleNext(from)
    }

    scheduleNext(0)
    return () => {
      cancelled = true
      genRef.current += 1
      clearTimers()
    }
  }, [slides, surface])

  if (slides.length === 0) return null

  return (
    <>
      {slides.map((slide, i) => {
        const isActive = i === active
        const isIncoming = i === incoming
        const showSrc = isActive || isIncoming || loaded.has(i)
        // Active always visible. Incoming becomes visible only once fading starts,
        // so the previous slide covers the plate until the next bitmap is ready.
        const layerOn = isActive || (isIncoming && fading)

        return (
          <HomeImg
            key={slide.src}
            src={showSrc ? slide.src : undefined}
            surface={surface}
            alt={isActive ? slide.alt : ""}
            aria-hidden={isActive ? undefined : true}
            className="hp-hero-img"
            data-slide={i}
            data-active={layerOn ? "true" : "false"}
            fetchPriority={i === 0 ? "high" : undefined}
            decoding="async"
            draggable={false}
          />
        )
      })}
    </>
  )
}
