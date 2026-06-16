"use client"

import Link from "next/link"
import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CardColorVariant, CardModelVariant } from "@/lib/card-color-media"
import { buildGalleryStripUrls } from "@/lib/product-images"
import { useVerifiedStripExtras } from "@/components/use-verified-strip-extras"
import { useSwatchColors } from "@/lib/use-swatch-colors"
import { fallbackHexForToken } from "@/lib/swatch-fallback-colors"

type Props = {
  mainSrc: string
  extraSrcs: string[]
  headboardVariants?: CardModelVariant[]
  upholsteryVariants?: CardColorVariant[]
  woodVariants?: CardColorVariant[]
  finishVariants?: CardColorVariant[]
  finishLabel?: "Цвет" | "Отделка"
  href: string
  alt: string
  oliverMode?: boolean
}

function resolveCombinedMedia(
  mainSrc: string,
  extraSrcs: string[],
  headboard: CardModelVariant | null | undefined,
  upholstery: CardColorVariant | null | undefined,
  wood: CardColorVariant | null | undefined,
  finish: CardColorVariant | null | undefined
): { mainSrc: string; extraSrcs: string[] } {
  if (
    headboard?.mainSrc?.trim() &&
    !upholstery &&
    !wood &&
    !finish
  ) {
    return {
      mainSrc: headboard.mainSrc.trim(),
      extraSrcs: headboard.extraSrcs,
    }
  }
  if (upholstery?.mainSrc?.trim()) {
    return {
      mainSrc: upholstery.mainSrc.trim(),
      extraSrcs: upholstery.extraSrcs,
    }
  }
  if (wood?.mainSrc?.trim()) {
    return {
      mainSrc: wood.mainSrc.trim(),
      extraSrcs: wood.extraSrcs,
    }
  }
  if (finish?.mainSrc?.trim()) {
    return {
      mainSrc: finish.mainSrc.trim(),
      extraSrcs: finish.extraSrcs,
    }
  }
  if (headboard?.mainSrc?.trim()) {
    return {
      mainSrc: headboard.mainSrc.trim(),
      extraSrcs: headboard.extraSrcs,
    }
  }
  return { mainSrc: mainSrc.trim(), extraSrcs }
}

function OliverHeroAbsent() {
  return (
    <div className="card-img oliver-media-absent" aria-label="Нет изображения">
      <span className="oliver-media-absent-label">Нет фото</span>
    </div>
  )
}

type ThumbCarouselProps = {
  variantMain: string
  visibleStrip: string[]
  activeGalleryUrl: string | null
  displayHeroSrc: string
  pendingPreloadUrl: string | null
  onThumbPick: (url: string, isMain: boolean) => (e: MouseEvent<HTMLButtonElement>) => void
  onThumbError: (url: string) => void
}

function ProductCardThumbCarousel({
  variantMain,
  visibleStrip,
  activeGalleryUrl,
  displayHeroSrc,
  pendingPreloadUrl,
  onThumbPick,
  onThumbError,
}: ThumbCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const stripKey = visibleStrip.join("\u0000")

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
            ? activeGalleryUrl === null && displayHeroSrc === variantMain
            : activeGalleryUrl === url
          const isBusy = pendingPreloadUrl === url
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
                src={url}
                alt=""
                loading="lazy"
                className="product-card-media-thumb-img"
                onError={() => onThumbError(url)}
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

export function ProductCardMediaGalleryCore({
  mainSrc,
  extraSrcs,
  headboardVariants,
  upholsteryVariants,
  woodVariants,
  finishVariants,
  finishLabel = "Цвет",
  href,
  alt,
  oliverMode = false,
}: Props) {
  const hasHeadboard = Boolean(headboardVariants && headboardVariants.length > 1)
  const hasUpholstery = Boolean(
    upholsteryVariants && upholsteryVariants.length > 1
  )
  const hasWood = Boolean(woodVariants && woodVariants.length > 1)
  const hasFinish = Boolean(finishVariants && finishVariants.length > 1)

  const allSwatchVariants = useMemo(
    () => [
      ...(upholsteryVariants ?? []),
      ...(woodVariants ?? []),
      ...(finishVariants ?? []),
    ],
    [upholsteryVariants, woodVariants, finishVariants]
  )
  const swatchSamples = useSwatchColors(
    allSwatchVariants.length > 1 ? allSwatchVariants : undefined
  )

  const [activeHeadboardKey, setActiveHeadboardKey] = useState<string | null>(
    () => headboardVariants?.[0]?.key ?? null
  )
  const [activeUpholsteryKey, setActiveUpholsteryKey] = useState<string | null>(
    () => upholsteryVariants?.[0]?.key ?? null
  )
  const [activeWoodKey, setActiveWoodKey] = useState<string | null>(
    () => woodVariants?.[0]?.key ?? null
  )
  const [activeFinishKey, setActiveFinishKey] = useState<string | null>(
    () => finishVariants?.[0]?.key ?? null
  )
  const [displayHeroSrc, setDisplayHeroSrc] = useState(mainSrc.trim())
  const [heroFailed, setHeroFailed] = useState(false)
  const [activeGalleryUrl, setActiveGalleryUrl] = useState<string | null>(null)
  const [failedExtras, setFailedExtras] = useState<Set<string>>(() => new Set())
  const [pendingPreloadUrl, setPendingPreloadUrl] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)

  const activeHeadboard = useMemo(() => {
    if (!hasHeadboard || !headboardVariants) return null
    return (
      headboardVariants.find((v) => v.key === activeHeadboardKey) ??
      headboardVariants[0]
    )
  }, [activeHeadboardKey, headboardVariants, hasHeadboard])

  const activeUpholstery = useMemo(() => {
    if (!hasUpholstery || !upholsteryVariants) return null
    return (
      upholsteryVariants.find((v) => v.key === activeUpholsteryKey) ??
      upholsteryVariants[0]
    )
  }, [activeUpholsteryKey, upholsteryVariants, hasUpholstery])

  const activeWood = useMemo(() => {
    if (!hasWood || !woodVariants) return null
    return woodVariants.find((v) => v.key === activeWoodKey) ?? woodVariants[0]
  }, [activeWoodKey, woodVariants, hasWood])

  const activeFinish = useMemo(() => {
    if (!hasFinish || !finishVariants) return null
    return (
      finishVariants.find((v) => v.key === activeFinishKey) ?? finishVariants[0]
    )
  }, [activeFinishKey, finishVariants, hasFinish])

  const resolved = resolveCombinedMedia(
    mainSrc,
    extraSrcs,
    activeHeadboard,
    activeUpholstery,
    activeWood,
    activeFinish
  )
  const variantMain = resolved.mainSrc
  const variantExtras = resolved.extraSrcs

  const galleryStripCandidates = useMemo(
    () => buildGalleryStripUrls(variantMain, variantExtras),
    [variantMain, variantExtras]
  )

  const productMediaKey = useMemo(
    () =>
      [
        mainSrc,
        extraSrcs.join("\u0000"),
        headboardVariants
          ?.map(
            (v) =>
              `${v.key}\u0001${v.mainSrc}\u0001${v.extraSrcs.join("\u0002")}`
          )
          .join("\u0003") ?? "",
        upholsteryVariants
          ?.map(
            (v) =>
              `${v.key}\u0001${v.mainSrc}\u0001${v.extraSrcs.join("\u0002")}`
          )
          .join("\u0004") ?? "",
        woodVariants
          ?.map(
            (v) =>
              `${v.key}\u0001${v.mainSrc}\u0001${v.extraSrcs.join("\u0002")}`
          )
          .join("\u0005") ?? "",
        finishVariants
          ?.map(
            (v) =>
              `${v.key}\u0001${v.mainSrc}\u0001${v.extraSrcs.join("\u0002")}`
          )
          .join("\u0007") ?? "",
      ].join("\u0006"),
    [
      mainSrc,
      extraSrcs,
      headboardVariants,
      upholsteryVariants,
      woodVariants,
      finishVariants,
    ]
  )

  useEffect(() => {
    setActiveHeadboardKey(headboardVariants?.[0]?.key ?? null)
    setActiveUpholsteryKey(upholsteryVariants?.[0]?.key ?? null)
    setActiveWoodKey(woodVariants?.[0]?.key ?? null)
    setActiveFinishKey(finishVariants?.[0]?.key ?? null)
    const initial = resolveCombinedMedia(
      mainSrc,
      extraSrcs,
      headboardVariants?.[0],
      upholsteryVariants?.[0],
      woodVariants?.[0],
      finishVariants?.[0]
    )
    setDisplayHeroSrc(initial.mainSrc)
    setHeroFailed(false)
    setActiveGalleryUrl(null)
    setFailedExtras(new Set())
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [
    productMediaKey,
    headboardVariants,
    upholsteryVariants,
    woodVariants,
    finishVariants,
    mainSrc,
    extraSrcs,
  ])

  const visibleStrip = useVerifiedStripExtras(
    galleryStripCandidates,
    failedExtras
  )

  const showHeadboard = hasHeadboard && headboardVariants != null
  const showUpholstery = hasUpholstery && upholsteryVariants != null
  const showWood = hasWood && woodVariants != null
  const showFinish = hasFinish && finishVariants != null
  const showExecutionControls =
    showHeadboard || showUpholstery || showWood || showFinish
  const showThumbRow = visibleStrip.length > 0

  const applyMediaSelection = useCallback(
    (nextMain: string) => {
      setDisplayHeroSrc(nextMain.trim())
      setActiveGalleryUrl(null)
      setHeroFailed(false)
      setFailedExtras(new Set())
      pendingRef.current = null
      setPendingPreloadUrl(null)
    },
    []
  )

  const onHeroError = useCallback(() => {
    if (oliverMode && displayHeroSrc === variantMain) {
      setHeroFailed(true)
      return
    }
    setDisplayHeroSrc(variantMain)
    setActiveGalleryUrl(null)
    setHeroFailed(false)
  }, [displayHeroSrc, oliverMode, variantMain])

  const onThumbPick = useCallback(
    (url: string, isMain: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (isMain && activeGalleryUrl === null && displayHeroSrc === variantMain) {
        return
      }
      if (!isMain && activeGalleryUrl === url) return
      if (pendingRef.current === url) return
      pendingRef.current = url
      setPendingPreloadUrl(url)
    },
    [activeGalleryUrl, displayHeroSrc, variantMain]
  )

  const onPreloadLoad = useCallback(() => {
    const u = pendingRef.current
    if (!u) return
    setDisplayHeroSrc(u)
    setHeroFailed(false)
    setActiveGalleryUrl(u === variantMain ? null : u)
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [variantMain])

  const onPreloadError = useCallback(() => {
    const u = pendingRef.current
    if (!u) return
    setFailedExtras((prev) => new Set(prev).add(u))
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [])

  const onHeadboardPick = useCallback(
    (variant: CardModelVariant) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (variant.key === activeHeadboardKey) return
      setActiveHeadboardKey(variant.key)
      applyMediaSelection(variant.mainSrc.trim())
    },
    [activeHeadboardKey, applyMediaSelection]
  )

  const onUpholsteryPick = useCallback(
    (variant: CardColorVariant) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (variant.key === activeUpholsteryKey) return
      setActiveUpholsteryKey(variant.key)
      const media = resolveCombinedMedia(
        mainSrc,
        extraSrcs,
        activeHeadboard,
        variant,
        activeWood,
        activeFinish
      )
      applyMediaSelection(media.mainSrc)
    },
    [
      activeUpholsteryKey,
      activeHeadboard,
      activeWood,
      activeFinish,
      mainSrc,
      extraSrcs,
      applyMediaSelection,
    ]
  )

  const onWoodPick = useCallback(
    (variant: CardColorVariant) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (variant.key === activeWoodKey) return
      setActiveWoodKey(variant.key)
      const media = resolveCombinedMedia(
        mainSrc,
        extraSrcs,
        activeHeadboard,
        activeUpholstery,
        variant,
        activeFinish
      )
      applyMediaSelection(media.mainSrc)
    },
    [
      activeWoodKey,
      activeHeadboard,
      activeUpholstery,
      activeFinish,
      mainSrc,
      extraSrcs,
      applyMediaSelection,
    ]
  )

  const onFinishPick = useCallback(
    (variant: CardColorVariant) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (variant.key === activeFinishKey) return
      setActiveFinishKey(variant.key)
      const media = resolveCombinedMedia(
        mainSrc,
        extraSrcs,
        activeHeadboard,
        activeUpholstery,
        activeWood,
        variant
      )
      applyMediaSelection(media.mainSrc)
    },
    [
      activeFinishKey,
      activeHeadboard,
      activeUpholstery,
      activeWood,
      mainSrc,
      extraSrcs,
      applyMediaSelection,
    ]
  )

  const renderSwatchRow = (
    label: string,
    ariaLabel: string,
    variants: CardColorVariant[],
    activeKey: string | null,
    onPick: (v: CardColorVariant) => (e: MouseEvent<HTMLButtonElement>) => void
  ) => (
    <div
      className="product-card-selector-section"
      role="toolbar"
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="product-card-selector-label">{label}</span>
      <div className="product-card-execution-swatches product-card-execution-swatches--inline">
        {variants.map((variant) => {
          const isActive = variant.key === activeKey
          const token = variant.swatchToken
          const sampled = swatchSamples.get(variant.key)
          const fillColor =
            sampled?.color || fallbackHexForToken(token ?? "neutral")
          return (
            <button
              key={variant.key}
              type="button"
              className={`product-card-execution-swatch${isActive ? " is-active" : ""}`}
              data-swatch-token={token ?? "neutral"}
              data-swatch-source={sampled?.source ?? "fallback_token"}
              aria-pressed={isActive}
              aria-label={variant.label}
              title={variant.label}
              onClick={onPick(variant)}
            >
              <span
                className="product-card-execution-swatch-fill"
                aria-hidden="true"
                style={{ backgroundColor: fillColor }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )

  const heroEmpty = oliverMode && (!displayHeroSrc || heroFailed)

  return (
    <div
      className={`product-card-media-switcher${oliverMode ? " oliver-card-media-switcher" : ""}`}
    >
      <Link href={href} className="product-card-media-link card-link" aria-label={alt}>
        {heroEmpty ? (
          <OliverHeroAbsent />
        ) : !displayHeroSrc ? (
          <div className="card-img card-img-placeholder" aria-hidden="true" />
        ) : (
          <img
            src={displayHeroSrc}
            alt={alt}
            className="card-img"
            loading="lazy"
            onError={onHeroError}
          />
        )}
      </Link>
      {pendingPreloadUrl && (
        <img
          key={pendingPreloadUrl}
          src={pendingPreloadUrl}
          alt=""
          className="product-card-media-preload"
          aria-hidden={true}
          onLoad={onPreloadLoad}
          onError={onPreloadError}
        />
      )}
      {showExecutionControls && (
        <div className="product-card-execution-controls">
          {showHeadboard && (
            <div
              className="product-card-selector-section"
              role="toolbar"
              aria-label="Изголовье"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="product-card-selector-label">Изголовье</span>
              <div className="product-card-model-chips">
                {headboardVariants!.map((variant) => {
                  const isActive = variant.key === activeHeadboardKey
                  return (
                    <button
                      key={variant.key}
                      type="button"
                      className={`product-card-model-chip${isActive ? " is-active" : ""}`}
                      aria-pressed={isActive}
                      onClick={onHeadboardPick(variant)}
                    >
                      {variant.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {showUpholstery &&
            renderSwatchRow(
              "Обивка",
              "Обивка",
              upholsteryVariants!,
              activeUpholsteryKey,
              onUpholsteryPick
            )}
          {showWood &&
            renderSwatchRow(
              "Дерево",
              "Дерево",
              woodVariants!,
              activeWoodKey,
              onWoodPick
            )}
          {showFinish &&
            renderSwatchRow(
              finishLabel,
              finishLabel,
              finishVariants!,
              activeFinishKey,
              onFinishPick
            )}
        </div>
      )}
      {showThumbRow && (
        <ProductCardThumbCarousel
          variantMain={variantMain}
          visibleStrip={visibleStrip}
          activeGalleryUrl={activeGalleryUrl}
          displayHeroSrc={displayHeroSrc}
          pendingPreloadUrl={pendingPreloadUrl}
          onThumbPick={onThumbPick}
          onThumbError={(url) =>
            setFailedExtras((prev) => {
              const next = new Set(prev)
              next.add(url)
              return next
            })
          }
        />
      )}
    </div>
  )
}
