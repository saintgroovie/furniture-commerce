"use client"

import { useEffect } from "react"

type Props = {
  images: string[]
  activeIndex: number
  alt: string
  onClose: () => void
  onNavigate: (index: number) => void
}

/**
 * Full-size, uncropped photo viewer opened by clicking the PDP hero image.
 * Shared across every PDP media switcher so "open original photo" behaves
 * identically regardless of product family (Oliver, Greenwich, execution grid, plain).
 */
export function PdpImageLightbox({
  images,
  activeIndex,
  alt,
  onClose,
  onNavigate,
}: Props) {
  const count = images.length
  const src = images[activeIndex]

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }
      if (count < 2) return
      if (e.key === "ArrowLeft") onNavigate((activeIndex - 1 + count) % count)
      if (e.key === "ArrowRight") onNavigate((activeIndex + 1) % count)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [activeIndex, count, onClose, onNavigate])

  if (!src) return null

  return (
    <div
      className="pdp-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        className="pdp-lightbox-close"
        aria-label="Закрыть"
        onClick={onClose}
      >
        ×
      </button>
      {count > 1 && (
        <button
          type="button"
          className="pdp-lightbox-nav pdp-lightbox-nav--prev"
          aria-label="Предыдущее фото"
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((activeIndex - 1 + count) % count)
          }}
        >
          ‹
        </button>
      )}
      <img
        src={src}
        alt={alt}
        className="pdp-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
      {count > 1 && (
        <button
          type="button"
          className="pdp-lightbox-nav pdp-lightbox-nav--next"
          aria-label="Следующее фото"
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((activeIndex + 1) % count)
          }}
        >
          ›
        </button>
      )}
      {count > 1 && (
        <div className="pdp-lightbox-counter" aria-hidden="true">
          {activeIndex + 1} / {count}
        </div>
      )}
    </div>
  )
}
