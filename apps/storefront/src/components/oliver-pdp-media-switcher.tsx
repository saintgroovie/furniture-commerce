"use client"

import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ProductThumbCarousel } from "@/components/product-thumb-carousel"
import { PdpImageLightbox } from "@/components/pdp-image-lightbox"
import { buildOliverPdpThumbStripUrls } from "@/lib/oliver-pdp-thumb-strip"
import { states } from "@/lib/woodright-copy"

type Props = {
  mainSrc: string
  extraSrcs: string[]
  title: string
}

function OliverPdpHeroAbsent({
  className,
  reason,
}: {
  className: string
  reason: "missing" | "failed"
}) {
  const label = reason === "failed" ? states.mediaLoadFailed : states.mediaMissing
  return (
    <div className={`${className} oliver-media-absent`} aria-label={label}>
      <span className="oliver-media-absent-label">{label}</span>
    </div>
  )
}

/** Oliver PDP: hero from `mainSrc`; strip includes main + extras, preload before swap. */
export function OliverPdpMediaSwitcher({ mainSrc, extraSrcs, title }: Props) {
  const mainTrimmed = mainSrc.trim()
  const [displayHeroSrc, setDisplayHeroSrc] = useState(mainTrimmed)
  const [heroFailed, setHeroFailed] = useState(false)
  const [activeGalleryUrl, setActiveGalleryUrl] = useState<string | null>(null)
  const [failedExtras, setFailedExtras] = useState<Set<string>>(() => new Set())
  const [pendingPreloadUrl, setPendingPreloadUrl] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const galleryStripCandidates = useMemo(
    () => buildOliverPdpThumbStripUrls(mainTrimmed, extraSrcs),
    [mainTrimmed, extraSrcs]
  )

  const stripKey = useMemo(
    () => galleryStripCandidates.join("\u0000"),
    [galleryStripCandidates]
  )

  useEffect(() => {
    setDisplayHeroSrc(mainTrimmed)
    setHeroFailed(false)
    setActiveGalleryUrl(null)
    setFailedExtras(new Set())
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [mainTrimmed, stripKey])

  const rawVisibleStrip = useMemo(
    () => galleryStripCandidates.filter((u) => !failedExtras.has(u)),
    [galleryStripCandidates, failedExtras]
  )
  // Defense in depth: the main photo is a legitimate candidate in Oliver's strip
  // (main + extras) — never let a stale failedExtras entry hide it, since its
  // validity is already proven by the hero render.
  const visibleStrip = useMemo(() => {
    if (!galleryStripCandidates.includes(mainTrimmed)) return rawVisibleStrip
    if (rawVisibleStrip.includes(mainTrimmed)) return rawVisibleStrip
    return [mainTrimmed, ...rawVisibleStrip.filter((u) => u !== mainTrimmed)]
  }, [rawVisibleStrip, galleryStripCandidates, mainTrimmed])

  const showThumbRow = visibleStrip.length > 0

  const onHeroError = useCallback(() => {
    if (displayHeroSrc === mainTrimmed) {
      setHeroFailed(true)
      return
    }
    setDisplayHeroSrc(mainTrimmed)
    setActiveGalleryUrl(null)
    setHeroFailed(false)
  }, [displayHeroSrc, mainTrimmed])

  const onThumbPick = useCallback(
    (url: string, isMain: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (isMain) {
        // The main photo is already known-good — swap to it directly instead of
        // routing through the fallible preload-then-swap path. Without this, a
        // transient reload hiccup on the way back to main would permanently hide
        // the main thumbnail (Oliver's strip includes main).
        if (activeGalleryUrl === null && displayHeroSrc === mainTrimmed) return
        setDisplayHeroSrc(mainTrimmed)
        setActiveGalleryUrl(null)
        setHeroFailed(false)
        pendingRef.current = null
        setPendingPreloadUrl(null)
        return
      }
      if (activeGalleryUrl === url) {
        setDisplayHeroSrc(mainTrimmed)
        setActiveGalleryUrl(null)
        setHeroFailed(false)
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
    setHeroFailed(false)
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

  const heroEmpty = !displayHeroSrc || heroFailed

  const lightboxImages = visibleStrip.length > 0 ? visibleStrip : [displayHeroSrc]

  const openLightbox = useCallback(() => {
    if (heroEmpty) return
    const idx = lightboxImages.indexOf(displayHeroSrc)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }, [heroEmpty, lightboxImages, displayHeroSrc])

  return (
    <div className="product-pdp-media-switcher oliver-pdp-media-switcher">
      <div className="product-pdp-media-hero">
        {heroEmpty ? (
          <OliverPdpHeroAbsent
            className="product-detail-img"
            reason={heroFailed ? "failed" : "missing"}
          />
        ) : (
          <img
            src={displayHeroSrc}
            alt={title}
            className="product-detail-img is-zoomable"
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
          alt={title}
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
