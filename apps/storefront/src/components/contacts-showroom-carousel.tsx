"use client"

import { useEffect, useRef, useState } from "react"
import { ContactsPodiumPhoto } from "@/components/contacts-podium-photo"
import { showroomCarouselFrames } from "@/lib/showroom-carousel-media"

const INTERVAL_MS = 3000
const COUNT = showroomCarouselFrames.length

export function ContactsShowroomCarousel() {
  const root = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const pointerToggle = useRef(false)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)
  const running = !paused && !hovered && visible && pageVisible

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const respectMotion = () => {
      if (media.matches) setPaused(true)
    }
    respectMotion()
    media.addEventListener("change", respectMotion)
    const syncVisibility = () => setPageVisible(!document.hidden)
    syncVisibility()
    document.addEventListener("visibilitychange", syncVisibility)
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting)
    }, { threshold: 0.15 })
    if (root.current) observer.observe(root.current)
    return () => {
      observer.disconnect()
      media.removeEventListener("change", respectMotion)
      document.removeEventListener("visibilitychange", syncVisibility)
    }
  }, [])

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % COUNT)
    }, INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [active, running])

  function select(index: number) {
    setActive((index + COUNT) % COUNT)
    setPaused(true)
  }

  return (
    <div
      ref={root}
      className="contacts-carousel"
      role="region"
      aria-roledescription="карусель"
      aria-label="Фотографии шоурума Woodright"
      tabIndex={0}
      data-active-slide={active + 1}
      data-running={running}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(true)
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault()
          select(active + (event.key === "ArrowLeft" ? -1 : 1))
        }
      }}
      onTouchStart={(event) => {
        const point = event.touches[0]
        touchStart.current = { x: point.clientX, y: point.clientY }
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current
        touchStart.current = null
        if (!start) return
        const point = event.changedTouches[0]
        const dx = point.clientX - start.x
        const dy = point.clientY - start.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          select(active + (dx < 0 ? 1 : -1))
        }
      }}
    >
      <div className="contacts-carousel-photos" aria-live={paused ? "polite" : "off"}>
        {showroomCarouselFrames.map((frame, index) => (
          <div
            key={frame.id}
            className={`contacts-carousel-slide${index === active ? " is-active" : ""}${index === 0 ? " contacts-carousel-slide--panorama" : ""}`}
            role="group"
            aria-roledescription="слайд"
            aria-label={`${index + 1} из ${COUNT}`}
            aria-hidden={index !== active}
          >
            {index > 0 && (
              <img className="contacts-carousel-backdrop" src={frame.smallWebp} alt="" aria-hidden="true" loading="lazy" decoding="async" />
            )}
            <ContactsPodiumPhoto frame={frame} sizes="100vw" priority={index === 0} />
          </div>
        ))}
      </div>
      <div className="contacts-carousel-fade" aria-hidden="true" />
      <div className="contacts-carousel-controls">
        <button type="button" className="contacts-carousel-arrow contacts-carousel-arrow--previous" aria-label="Предыдущее фото" onClick={() => select(active - 1)}>
          <img src="/images/footer/arrow-right.svg" alt="" width={18} height={18} />
        </button>
        <div className="contacts-carousel-pagination" role="group" aria-label="Выбрать фото">
          {showroomCarouselFrames.map((frame, index) => (
            <button
              key={frame.id}
              type="button"
              className="contacts-carousel-page"
              aria-label={`Фото ${index + 1}: ${frame.alt}`}
              aria-current={index === active ? "true" : undefined}
              onClick={() => select(index)}
            >
              <span className="contacts-carousel-page-track">
                {index === active && <span key={`${index}-${running}`} className={`contacts-carousel-page-fill${running ? " is-running" : ""}`} />}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="contacts-carousel-arrow" aria-label="Следующее фото" onClick={() => select(active + 1)}>
          <img src="/images/footer/arrow-right.svg" alt="" width={18} height={18} />
        </button>
        <button
          type="button"
          className="contacts-carousel-toggle"
          aria-label={paused ? "Включить автоматическое перелистывание" : "Остановить автоматическое перелистывание"}
          onPointerDown={() => { pointerToggle.current = !paused }}
          onClick={(event) => {
            // Focus pauses the carousel before a pointer click reaches this button.
            setPaused(event.detail > 0 ? pointerToggle.current : !paused)
          }}
        >
          {paused ? "Авто" : "Пауза"}
        </button>
        <span className="contacts-carousel-count" aria-hidden="true">{String(active + 1).padStart(2, "0")} / {String(COUNT).padStart(2, "0")}</span>
      </div>
    </div>
  )
}
