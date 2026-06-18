"use client"

import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVerifiedStripExtras } from "@/components/use-verified-strip-extras"
import { buildGalleryStripUrls } from "@/lib/product-images"

type Props = {
  mainSrc: string
  extraSrcs: string[]
  alt: string
  heroObjectPosition?: string
}

export function ProductPdpMediaSwitcher({
  mainSrc,
  extraSrcs,
  alt,
  heroObjectPosition,
}: Props) {
  const mainTrimmed = mainSrc.trim()
  const [displayHeroSrc, setDisplayHeroSrc] = useState(mainTrimmed)
  const [activeGalleryUrl, setActiveGalleryUrl] = useState<string | null>(null)
  const [failedExtras, setFailedExtras] = useState<Set<string>>(() => new Set())
  const [pendingPreloadUrl, setPendingPreloadUrl] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)

  const galleryStripCandidates = useMemo(
    () => buildGalleryStripUrls(mainTrimmed, extraSrcs),
    [mainTrimmed, extraSrcs]
  )

  const stripKey = useMemo(
    () => galleryStripCandidates.join("\u0000"),
    [galleryStripCandidates]
  )

  useEffect(() => {
    setDisplayHeroSrc(mainTrimmed)
    setActiveGalleryUrl(null)
    setFailedExtras(new Set())
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [mainTrimmed, stripKey])

  const visibleStrip = useVerifiedStripExtras(galleryStripCandidates, failedExtras)

  const showThumbRow = visibleStrip.length > 0

  const onHeroError = useCallback(() => {
    setDisplayHeroSrc(mainTrimmed)
    setActiveGalleryUrl(null)
  }, [mainTrimmed])

  const onThumbPick = useCallback(
    (url: string, isMain: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (isMain && activeGalleryUrl === null && displayHeroSrc === mainTrimmed) {
        return
      }
      if (!isMain && activeGalleryUrl === url) return
      if (pendingRef.current === url) return
      pendingRef.current = url
      setPendingPreloadUrl(url)
    },
    [activeGalleryUrl, displayHeroSrc, mainTrimmed]
  )

  const onPreloadLoad = useCallback(() => {
    const u = pendingRef.current
    if (!u) return
    setDisplayHeroSrc(u)
    setActiveGalleryUrl(u === mainTrimmed ? null : u)
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [mainTrimmed])

  const onPreloadError = useCallback(() => {
    const u = pendingRef.current
    if (!u) return
    setFailedExtras((prev) => new Set(prev).add(u))
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [])

  const heroIsPlaceholder = !displayHeroSrc

  return (
    <div className="product-pdp-media-switcher">
      <div className="product-pdp-media-hero">
        {heroIsPlaceholder ? (
          <div className="product-detail-img skeleton" aria-hidden="true" />
        ) : (
          <img
            src={displayHeroSrc}
            alt={alt}
            className="product-detail-img"
            style={
              heroObjectPosition
                ? { objectPosition: heroObjectPosition }
                : undefined
            }
            loading="eager"
            onError={onHeroError}
          />
        )}
      </div>
      {pendingPreloadUrl && (
        <img
          key={pendingPreloadUrl}
          src={pendingPreloadUrl}
          alt=""
          className="product-pdp-media-preload"
          aria-hidden={true}
          onLoad={onPreloadLoad}
          onError={onPreloadError}
        />
      )}
      {showThumbRow && (
        <div
          className="product-pdp-media-thumbs"
          role="toolbar"
          aria-label="Фото товара"
        >
          {visibleStrip.map((url) => {
            const isMain = url === mainTrimmed
            const isActive = isMain
              ? activeGalleryUrl === null && displayHeroSrc === mainTrimmed
              : activeGalleryUrl === url
            const isBusy = pendingPreloadUrl === url
            return (
              <button
                key={url}
                type="button"
                className={`product-pdp-media-thumb${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                aria-busy={isBusy}
                disabled={isBusy}
                onClick={onThumbPick(url, isMain)}
                title={isMain ? "Основное фото" : "Показать фото"}
              >
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className="product-pdp-media-thumb-img"
                  onError={() =>
                    setFailedExtras((prev) => {
                      const next = new Set(prev)
                      next.add(url)
                      return next
                    })
                  }
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
