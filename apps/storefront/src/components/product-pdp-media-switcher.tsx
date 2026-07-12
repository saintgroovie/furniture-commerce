"use client"

import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ProductThumbCarousel } from "@/components/product-thumb-carousel"
import { PdpImageLightbox } from "@/components/pdp-image-lightbox"
import { useVerifiedStripExtras } from "@/components/use-verified-strip-extras"
import { buildPdpThumbStripUrls } from "@/lib/product-images"
import { states } from "@/lib/woodright-copy"

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const galleryStripCandidates = useMemo(
    () => buildPdpThumbStripUrls(mainTrimmed, extraSrcs),
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

  const rawVisibleStrip = useVerifiedStripExtras(galleryStripCandidates, failedExtras)
  // Defense in depth: never let the main photo disappear from the strip, even if it
  // were ever a candidate — its validity is already proven by the hero render.
  const visibleStrip = useMemo(() => {
    if (!galleryStripCandidates.includes(mainTrimmed)) return rawVisibleStrip
    if (rawVisibleStrip.includes(mainTrimmed)) return rawVisibleStrip
    return [mainTrimmed, ...rawVisibleStrip.filter((u) => u !== mainTrimmed)]
  }, [rawVisibleStrip, galleryStripCandidates, mainTrimmed])

  const showThumbRow = visibleStrip.length > 0

  const onHeroError = useCallback(() => {
    setDisplayHeroSrc(mainTrimmed)
    setActiveGalleryUrl(null)
  }, [mainTrimmed])

  const onThumbPick = useCallback(
    (url: string, isMain: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (isMain) {
        // The main photo is already known-good — swap to it directly instead of
        // routing through the fallible preload-then-swap path, so a transient
        // reload hiccup can never hide it.
        if (activeGalleryUrl === null && displayHeroSrc === mainTrimmed) return
        setDisplayHeroSrc(mainTrimmed)
        setActiveGalleryUrl(null)
        pendingRef.current = null
        setPendingPreloadUrl(null)
        return
      }
      if (activeGalleryUrl === url) {
        setDisplayHeroSrc(mainTrimmed)
        setActiveGalleryUrl(null)
        return
      }
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
    pendingRef.current = null
    setPendingPreloadUrl(null)
    if (!u) return
    if (u === mainTrimmed) return
    setFailedExtras((prev) => new Set(prev).add(u))
  }, [mainTrimmed])

  const heroIsPlaceholder = !displayHeroSrc

  const lightboxImages = visibleStrip.length > 0 ? visibleStrip : [displayHeroSrc]

  const openLightbox = useCallback(() => {
    if (heroIsPlaceholder) return
    const idx = lightboxImages.indexOf(displayHeroSrc)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }, [heroIsPlaceholder, lightboxImages, displayHeroSrc])

  return (
    <div className="product-pdp-media-switcher">
      <div className="product-pdp-media-hero">
        {heroIsPlaceholder ? (
          <div className="product-detail-img oliver-media-absent">
            <span className="oliver-media-absent-label">{states.mediaMissing}</span>
          </div>
        ) : (
          <img
            src={displayHeroSrc}
            alt={alt}
            className="product-detail-img is-zoomable"
            style={
              heroObjectPosition
                ? { objectPosition: heroObjectPosition }
                : undefined
            }
            loading="eager"
            onError={onHeroError}
            onClick={openLightbox}
          />
        )}
      </div>
      {lightboxIndex !== null && (
        <PdpImageLightbox
          images={lightboxImages}
          activeIndex={lightboxIndex}
          alt={alt}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
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
        <ProductThumbCarousel
          variantMain={mainTrimmed}
          visibleStrip={visibleStrip}
          activeGalleryUrl={activeGalleryUrl}
          displayHeroSrc={displayHeroSrc}
          pendingPreloadUrl={pendingPreloadUrl}
          onThumbPick={onThumbPick}
          onThumbError={(url) => {
            if (url === mainTrimmed) return
            setFailedExtras((prev) => {
              const next = new Set(prev)
              next.add(url)
              return next
            })
          }}
        />
      )}
    </div>
  )
}
