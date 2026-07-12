"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { homeCopy } from "@/lib/woodright-copy"

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
 */
export function HomeRoomScene({ scenes }: { scenes: HomeScene[] }) {
  const [active, setActive] = useState(0)
  const [openSpot, setOpenSpot] = useState<number | null>(null)
  const pausedRef = useRef(false)

  const switchScene = useCallback((index: number) => {
    setActive(index)
    setOpenSpot(null)
  }, [])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Escape") setOpenSpot(null)
  }, [])

  // Gentle auto-rotation; pauses on hover/focus/open hotspot, off with
  // reduced motion.
  useEffect(() => {
    if (scenes.length < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => {
      if (pausedRef.current) return
      setOpenSpot((spot) => {
        if (spot == null) {
          setActive((i) => (i + 1) % scenes.length)
        }
        return spot
      })
    }, 7000)
    return () => window.clearInterval(id)
  }, [scenes.length])

  if (scenes.length === 0) return null
  const scene = scenes[active]

  return (
    <div
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
        {scenes.map((s, i) => (
          <img
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
        ))}

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
                  <span className="hp-scene-card-arrow" aria-hidden="true">→</span>
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
