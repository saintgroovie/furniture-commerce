"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { homeCopy } from "@/lib/woodright-copy"
import { HomeImg } from "./home-img"

export type HomeSceneSpot = {
  /** Percent offsets inside the scene image. */
  x: number
  y: number
  title: string
  price: string | null
  href: string
}

export type HomeScene = {
  id: string
  img: string
  alt: string
  spots: HomeSceneSpot[]
}

/**
 * Interactive room scene: numbered scene switcher + product hotspots.
 * Hotspots are real buttons that open a small card linking to the PDP —
 * never decorative dots. Keyboard: Enter/Space toggles, Escape closes.
 *
 * Auto-rotation pauses when the section is offscreen, the tab is hidden,
 * or the user is hovering / focusing / has a hotspot open. Only the active
 * (and next) scene image are mounted so the second room shot stays off the
 * critical path.
 */
export function HomeRoomScene({ scenes }: { scenes: HomeScene[] }) {
  const [active, setActive] = useState(0)
  const [openSpot, setOpenSpot] = useState<number | null>(null)
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0]))
  const pausedRef = useRef(false)
  const visibleRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const switchScene = useCallback((index: number) => {
    setActive(index)
    setOpenSpot(null)
    setMounted((prev) => {
      if (prev.has(index)) return prev
      const next = new Set(prev)
      next.add(index)
      return next
    })
  }, [])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Escape") setOpenSpot(null)
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el || !("IntersectionObserver" in window)) return
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
      },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (scenes.length < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const id = window.setInterval(() => {
      if (pausedRef.current) return
      if (!visibleRef.current) return
      if (document.hidden) return
      setOpenSpot((spot) => {
        if (spot == null) {
          setActive((i) => {
            const next = (i + 1) % scenes.length
            setMounted((prev) => {
              if (prev.has(next)) return prev
              const copy = new Set(prev)
              copy.add(next)
              return copy
            })
            return next
          })
        }
        return spot
      })
    }, 7000)
    return () => window.clearInterval(id)
  }, [scenes.length])

  // Warm the next scene a few seconds into the hold while onscreen.
  useEffect(() => {
    if (scenes.length < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const next = (active + 1) % scenes.length
    const timer = window.setTimeout(() => {
      if (!visibleRef.current || document.hidden) return
      setMounted((prev) => {
        if (prev.has(next)) return prev
        const copy = new Set(prev)
        copy.add(next)
        return copy
      })
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [active, scenes.length])

  if (scenes.length === 0) return null
  const scene = scenes[active]

  return (
    <div
      ref={rootRef}
      className="hp-scene"
      onKeyDown={handleKeyDown}
      onPointerEnter={() => {
        pausedRef.current = true
      }}
      onPointerLeave={() => {
        pausedRef.current = false
      }}
      onFocusCapture={() => {
        pausedRef.current = true
      }}
      onBlurCapture={() => {
        pausedRef.current = false
      }}
    >
      <div className="hp-scene-stage">
        {scenes.map((s, i) =>
          mounted.has(i) ? (
            <HomeImg
              key={s.id}
              src={s.img}
              alt={i === active ? s.alt : ""}
              aria-hidden={i === active ? undefined : true}
              className="hp-scene-img"
              data-active={i === active ? "true" : "false"}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : null
        )}

        {scene.spots.map((spot, i) => {
          const open = openSpot === i
          const flip = spot.x > 55
          return (
            <div
              key={`${scene.id}-${i}`}
              className="hp-scene-spot"
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            >
              <button
                type="button"
                className="hp-scene-dot"
                aria-expanded={open}
                aria-label={spot.title}
                onClick={() => setOpenSpot(open ? null : i)}
              >
                <span aria-hidden="true" />
              </button>
              {open && (
                <Link
                  href={spot.href}
                  className="hp-scene-card"
                  data-flip={flip ? "true" : "false"}
                >
                  <span className="hp-scene-card-title">{spot.title}</span>
                  {spot.price && (
                    <span className="hp-scene-card-price">{spot.price}</span>
                  )}
                  <span className="hp-scene-card-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              )}
            </div>
          )
        })}
      </div>

      {scenes.length > 1 && (
        <div className="hp-scene-nav" role="group" aria-label={homeCopy.sceneNav}>
          {scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="hp-scene-nav-btn"
              aria-pressed={i === active}
              aria-label={s.alt}
              onClick={() => switchScene(i)}
            >
              {String(i + 1).padStart(2, "0")}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
