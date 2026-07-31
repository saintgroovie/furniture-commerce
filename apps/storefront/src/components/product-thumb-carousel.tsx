"use client"

import type { MouseEvent } from "react"
import { useCallback, useEffect, useRef, useState } from "react"

export type ProductThumbCarouselProps = {
  variantMain: string
  visibleStrip: string[]
  activeGalleryUrl: string | null
  displayHeroSrc: string
  pendingPreloadUrl: string | null
  onThumbPick: (url: string, isMain: boolean) => (e: MouseEvent<HTMLButtonElement>) => void
  onThumbError: (url: string) => void
  /**
   * Catalog card WebP derivatives → original JPEG/PNG.
   * On derivative 404, swap the thumb src before blacklisting the photo.
   */
  srcFallbackByUrl?: Readonly<Record<string, string>>
}

/**
 * Shared buyer-facing thumbnail rail (scroll rail + edge arrows, active state,
 * busy/preload state) — used by catalog cards and every PDP gallery so the
 * gallery behaves the same everywhere a thumb strip is shown.
 */
export function ProductThumbCarousel({
  variantMain,
  visibleStrip,
  activeGalleryUrl,
  displayHeroSrc,
  pendingPreloadUrl,
  onThumbPick,
  onThumbError,
  srcFallbackByUrl,
}: ProductThumbCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  /** Logical strip URL → display src after a derivative fallback. */
  const [srcOverrides, setSrcOverrides] = useState<Record<string, string>>({})
  const stripKey = visibleStrip.join("\u0000")
  const [overridesStripKey, setOverridesStripKey] = useState(stripKey)
  if (stripKey !== overridesStripKey) {
    setOverridesStripKey(stripKey)
    setSrcOverrides({})
  }

  const updateScrollArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2)
  }, [])

  useEffect(() => {
    updateScrollArrows()
    const el = trackRef.current
    if (!el) return
    const onScroll = () => updateScrollArrows()
    el.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(updateScrollArrows)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [stripKey, updateScrollArrows])

  const scrollThumbs = useCallback((direction: -1 | 1) => {
    trackRef.current?.scrollBy({ left: direction * 132, behavior: "smooth" })
  }, [])

  return (
    <div
      className="product-card-media-thumbs-carousel"
      onClick={(e) => e.stopPropagation()}
    >
      {canScrollLeft && (
        <button
          type="button"
          className="product-card-media-thumbs-arrow product-card-media-thumbs-arrow--prev"
          aria-label="Прокрутить миниатюры назад"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            scrollThumbs(-1)
          }}
        >
          ‹
        </button>
      )}
      <div
        ref={trackRef}
        className="product-card-media-thumbs-track"
        role="toolbar"
        aria-label="Фото товара"
      >
        {visibleStrip.map((url) => {
          const isMain = url === variantMain
          const isActive = isMain
            ? activeGalleryUrl === null &&
              (displayHeroSrc === variantMain ||
                displayHeroSrc === srcFallbackByUrl?.[variantMain] ||
                displayHeroSrc === srcOverrides[variantMain])
            : activeGalleryUrl === url
          const isBusy = pendingPreloadUrl === url || pendingPreloadUrl === srcOverrides[url]
          const displaySrc = srcOverrides[url] ?? url
          return (
            <button
              key={url}
              type="button"
              className={`product-card-media-thumb${isActive ? " is-active" : ""}`}
              aria-pressed={isActive}
              aria-busy={isBusy}
              disabled={isBusy}
              onClick={onThumbPick(url, isMain)}
              title={isMain ? "Основное фото" : "Показать фото"}
            >
              <img
                src={displaySrc}
                alt=""
                loading="lazy"
                className="product-card-media-thumb-img"
                onError={() => {
                  const fallback = srcFallbackByUrl?.[url]
                  if (fallback && displaySrc !== fallback) {
                    setSrcOverrides((prev) =>
                      prev[url] === fallback ? prev : { ...prev, [url]: fallback }
                    )
                    return
                  }
                  // The main photo is already proven valid (it renders as the hero on
                  // load, possibly after its own derivative→original fallback) — never
                  // blacklist it from the strip.
                  if (isMain) return
                  onThumbError(url)
                }}
              />
            </button>
          )
        })}
      </div>
      {canScrollRight && (
        <button
          type="button"
          className="product-card-media-thumbs-arrow product-card-media-thumbs-arrow--next"
          aria-label="Прокрутить миниатюры вперёд"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            scrollThumbs(1)
          }}
        >
          ›
        </button>
      )}
    </div>
  )
}
