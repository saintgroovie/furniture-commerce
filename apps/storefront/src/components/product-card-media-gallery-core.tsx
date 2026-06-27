"use client"

import Link from "next/link"
import type { MouseEvent, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CardColorVariant, CardModelVariant } from "@/lib/card-color-media"
import {
  defaultGreenwichBedSelection,
  resolveGreenwichBedMedia,
  coerceGreenwichBedSelection,
  availableWoodKeysForHeadboard,
  availableFabricKeysForHeadboard,
  buildGreenwichBedSwatchVariants,
  type GreenwichBedMatrixEntry,
} from "@/lib/greenwich-bed-media"
import {
  availableFrameKeysForPaint,
  coerceGreenwichPaintSelection,
  defaultGreenwichPaintSelection,
  resolveGreenwichPaintMedia,
  type GreenwichPaintMatrixEntry,
} from "@/lib/greenwich-paint-media"
import { buildGalleryStripUrls, buildPdpThumbStripUrls } from "@/lib/product-images"
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
  finishLabel?: "Цвет" | "Отделка" | "Материал" | "Конструкция"
  href: string
  alt: string
  oliverMode?: boolean
  /** Greenwich bed matrix — scoped hero + gallery per headboard/wood/fabric. */
  greenwichBedMatrix?: GreenwichBedMatrixEntry[]
  /** Greenwich paint matrix — scoped hero + gallery per wood/paint. */
  greenwichPaintMatrix?: GreenwichPaintMatrixEntry[]
  layout?: "card" | "pdp"
  heroObjectPosition?: string
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

type SwatchScrollRailProps = {
  ariaLabel: string
  children: ReactNode
  stripKey: string
}

function ProductCardSwatchScrollRail({
  ariaLabel,
  children,
  stripKey,
}: SwatchScrollRailProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2)
  }, [])

  useEffect(() => {
    const run = () => updateScrollArrows()
    run()
    const t = window.setTimeout(run, 120)
    const el = trackRef.current
    if (!el) return () => window.clearTimeout(t)
    const onScroll = () => updateScrollArrows()
    el.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(run)
    ro.observe(el)
    return () => {
      window.clearTimeout(t)
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [stripKey, updateScrollArrows])

  const scrollSwatches = useCallback((direction: -1 | 1) => {
    trackRef.current?.scrollBy({ left: direction * 84, behavior: "smooth" })
  }, [])

  return (
    <div className="product-card-swatch-scroll-rail" onClick={(e) => e.stopPropagation()}>
      {canScrollLeft && (
        <button
          type="button"
          className="product-card-swatch-scroll-arrow product-card-swatch-scroll-arrow--prev"
          aria-label={`${ariaLabel}: прокрутить назад`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            scrollSwatches(-1)
          }}
        >
          ‹
        </button>
      )}
      <div
        ref={trackRef}
        className="product-card-execution-swatches product-card-execution-swatches--inline product-card-swatch-scroll-rail__track"
        role="presentation"
      >
        {children}
      </div>
      {canScrollRight && (
        <button
          type="button"
          className="product-card-swatch-scroll-arrow product-card-swatch-scroll-arrow--next"
          aria-label={`${ariaLabel}: прокрутить вперёд`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            scrollSwatches(1)
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
  greenwichBedMatrix,
  greenwichPaintMatrix,
  layout = "card",
  heroObjectPosition,
}: Props) {
  const isGreenwichBed = Boolean(greenwichBedMatrix && greenwichBedMatrix.length > 0)
  const isGreenwichPaint = Boolean(greenwichPaintMatrix && greenwichPaintMatrix.length > 0)
  const isProvencePaintWood = Boolean(
    finishVariants?.length === 1 &&
      woodVariants?.length === 1 &&
      finishVariants[0]?.key === "cream" &&
      woodVariants[0]?.key === "wood"
  )
  const bedDefaults = useMemo(
    () =>
      isGreenwichBed && greenwichBedMatrix
        ? defaultGreenwichBedSelection(greenwichBedMatrix)
        : null,
    [greenwichBedMatrix, isGreenwichBed]
  )
  const paintDefaults = useMemo(
    () =>
      isGreenwichPaint && greenwichPaintMatrix
        ? defaultGreenwichPaintSelection(greenwichPaintMatrix)
        : null,
    [greenwichPaintMatrix, isGreenwichPaint]
  )

  const hasHeadboard = Boolean(headboardVariants && headboardVariants.length > 1)
  const hasUpholstery = Boolean(
    upholsteryVariants && upholsteryVariants.length > 1
  )
  const hasWood = Boolean(woodVariants && woodVariants.length > 1)
  const hasFinish = Boolean(finishVariants && finishVariants.length > 1)

  const [activeHeadboardKey, setActiveHeadboardKey] = useState<string | null>(
    () => bedDefaults?.headboard ?? headboardVariants?.[0]?.key ?? null
  )
  const [activeUpholsteryKey, setActiveUpholsteryKey] = useState<string | null>(
    () => bedDefaults?.fabric ?? upholsteryVariants?.[0]?.key ?? null
  )
  const [activeWoodKey, setActiveWoodKey] = useState<string | null>(
    () =>
      bedDefaults?.frameMaterial ??
      paintDefaults?.frameMaterial ??
      woodVariants?.[0]?.key ??
      null
  )
  const [activeFinishKey, setActiveFinishKey] = useState<string | null>(
    () =>
      paintDefaults?.paintFinish ??
      finishVariants?.[0]?.key ??
      null
  )
  const [activeProvenceMediaKey, setActiveProvenceMediaKey] = useState<"cream" | "wood">(
    "cream"
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

  const resolved = useMemo(() => {
    if (
      isGreenwichBed &&
      greenwichBedMatrix &&
      activeHeadboardKey &&
      activeWoodKey &&
      activeUpholsteryKey
    ) {
      const fromMatrix = resolveGreenwichBedMedia(
        greenwichBedMatrix,
        activeHeadboardKey,
        activeWoodKey,
        activeUpholsteryKey
      )
      if (fromMatrix) return fromMatrix
    }
    if (isGreenwichPaint && greenwichPaintMatrix && activeWoodKey && activeFinishKey) {
      const fromPaint = resolveGreenwichPaintMedia(
        greenwichPaintMatrix,
        activeWoodKey,
        activeFinishKey
      )
      if (fromPaint) return fromPaint
    }
    if (isProvencePaintWood && activeFinish && activeWood) {
      const variant =
        activeProvenceMediaKey === "wood" ? activeWood : activeFinish
      return {
        mainSrc: variant.mainSrc.trim(),
        extraSrcs: variant.extraSrcs,
      }
    }
    return resolveCombinedMedia(
      mainSrc,
      extraSrcs,
      activeHeadboard,
      activeUpholstery,
      activeWood,
      activeFinish
    )
  }, [
    isGreenwichBed,
    isGreenwichPaint,
    greenwichBedMatrix,
    greenwichPaintMatrix,
    activeHeadboardKey,
    activeWoodKey,
    activeUpholsteryKey,
    activeFinishKey,
    activeProvenceMediaKey,
    isProvencePaintWood,
    mainSrc,
    extraSrcs,
    activeHeadboard,
    activeUpholstery,
    activeWood,
    activeFinish,
  ])
  const variantMain = resolved.mainSrc
  const variantExtras = resolved.extraSrcs

  const galleryStripCandidates = useMemo(
    () =>
      layout === "pdp"
        ? buildPdpThumbStripUrls(variantMain, variantExtras)
        : buildGalleryStripUrls(variantMain, variantExtras),
    [layout, variantMain, variantExtras]
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
        greenwichBedMatrix?.length ?? 0,
        greenwichPaintMatrix?.length ?? 0,
      ].join("\u0006"),
    [
      mainSrc,
      extraSrcs,
      headboardVariants,
      upholsteryVariants,
      woodVariants,
      finishVariants,
      greenwichBedMatrix,
      greenwichPaintMatrix,
    ]
  )

  useEffect(() => {
    const bedDefault =
      greenwichBedMatrix && greenwichBedMatrix.length > 0
        ? defaultGreenwichBedSelection(greenwichBedMatrix)
        : null
    const paintDefault =
      greenwichPaintMatrix && greenwichPaintMatrix.length > 0
        ? defaultGreenwichPaintSelection(greenwichPaintMatrix)
        : null
    setActiveHeadboardKey(bedDefault?.headboard ?? headboardVariants?.[0]?.key ?? null)
    setActiveUpholsteryKey(bedDefault?.fabric ?? upholsteryVariants?.[0]?.key ?? null)
    setActiveWoodKey(
      bedDefault?.frameMaterial ??
        paintDefault?.frameMaterial ??
        woodVariants?.[0]?.key ??
        null
    )
    setActiveFinishKey(paintDefault?.paintFinish ?? finishVariants?.[0]?.key ?? null)
    setActiveProvenceMediaKey("cream")
    const initial =
      bedDefault && greenwichBedMatrix
        ? resolveGreenwichBedMedia(
            greenwichBedMatrix,
            bedDefault.headboard,
            bedDefault.frameMaterial,
            bedDefault.fabric
          )
        : paintDefault && greenwichPaintMatrix
          ? resolveGreenwichPaintMedia(
              greenwichPaintMatrix,
              paintDefault.frameMaterial,
              paintDefault.paintFinish
            )
          : isProvencePaintWood && finishVariants?.[0]
            ? {
                mainSrc: finishVariants[0].mainSrc.trim(),
                extraSrcs: finishVariants[0].extraSrcs,
              }
            : resolveCombinedMedia(
            mainSrc,
            extraSrcs,
            headboardVariants?.[0],
            upholsteryVariants?.[0],
            woodVariants?.[0],
            finishVariants?.[0]
          )
    setDisplayHeroSrc(initial?.mainSrc?.trim() ?? mainSrc.trim())
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
    greenwichBedMatrix,
    greenwichPaintMatrix,
    mainSrc,
    extraSrcs,
  ])

  const resolveMatrixMain = useCallback(
    (hb: string, wood: string, fabric: string) => {
      if (!greenwichBedMatrix) return null
      return resolveGreenwichBedMedia(greenwichBedMatrix, hb, wood, fabric)
    },
    [greenwichBedMatrix]
  )

  const visibleStrip = useVerifiedStripExtras(
    galleryStripCandidates,
    failedExtras
  )

  const showHeadboard = hasHeadboard && headboardVariants != null
  const showUpholstery = hasUpholstery && upholsteryVariants != null
  const showWood = hasWood && woodVariants != null
  const visibleWoodVariants = useMemo(() => {
    if (isGreenwichPaint && greenwichPaintMatrix && activeFinishKey && woodVariants) {
      const allowed = new Set(
        availableFrameKeysForPaint(greenwichPaintMatrix, activeFinishKey)
      )
      return woodVariants.filter((v) => allowed.has(v.key))
    }
    if (!isGreenwichBed || !greenwichBedMatrix || !activeHeadboardKey || !woodVariants) {
      return woodVariants
    }
    const allowed = new Set(
      availableWoodKeysForHeadboard(greenwichBedMatrix, activeHeadboardKey)
    )
    return woodVariants.filter((v) => allowed.has(v.key))
  }, [
    isGreenwichPaint,
    greenwichPaintMatrix,
    activeFinishKey,
    isGreenwichBed,
    greenwichBedMatrix,
    activeHeadboardKey,
    woodVariants,
  ])
  const visibleUpholsteryVariants = useMemo(() => {
    if (
      !isGreenwichBed ||
      !greenwichBedMatrix ||
      !activeHeadboardKey ||
      !activeWoodKey ||
      !upholsteryVariants
    ) {
      return upholsteryVariants
    }
    const allowed = new Set(
      availableFabricKeysForHeadboard(
        greenwichBedMatrix,
        activeHeadboardKey,
        activeWoodKey
      )
    )
    return upholsteryVariants.filter((v) => allowed.has(v.key))
  }, [
    isGreenwichBed,
    greenwichBedMatrix,
    activeHeadboardKey,
    activeWoodKey,
    upholsteryVariants,
  ])
  const showVisibleUpholstery =
    Boolean(visibleUpholsteryVariants && visibleUpholsteryVariants.length > 1)
  const showVisibleWood = Boolean(
    visibleWoodVariants &&
      (isProvencePaintWood
        ? visibleWoodVariants.length >= 1
        : visibleWoodVariants.length > 1)
  )

  const visibleFinishVariants = finishVariants
  const showVisibleFinish = Boolean(
    visibleFinishVariants &&
      (isProvencePaintWood
        ? visibleFinishVariants.length >= 1
        : visibleFinishVariants.length > 1)
  )

  const headboardFabricsForSampling = useMemo(() => {
    if (
      !isGreenwichBed ||
      !greenwichBedMatrix ||
      !activeHeadboardKey ||
      !upholsteryVariants
    ) {
      return upholsteryVariants
    }
    const allowed = new Set<string>()
    for (const wood of availableWoodKeysForHeadboard(
      greenwichBedMatrix,
      activeHeadboardKey
    )) {
      for (const fabric of availableFabricKeysForHeadboard(
        greenwichBedMatrix,
        activeHeadboardKey,
        wood
      )) {
        allowed.add(fabric)
      }
    }
    return upholsteryVariants.filter((v) => allowed.has(v.key))
  }, [
    isGreenwichBed,
    greenwichBedMatrix,
    activeHeadboardKey,
    upholsteryVariants,
  ])

  const swatchSamplingVariants = useMemo(() => {
    if (isGreenwichBed && greenwichBedMatrix && activeHeadboardKey) {
      return buildGreenwichBedSwatchVariants(
        greenwichBedMatrix,
        activeHeadboardKey,
        visibleWoodVariants ?? [],
        headboardFabricsForSampling ?? [],
        finishVariants
      )
    }
    return [
      ...(upholsteryVariants ?? []),
      ...(woodVariants ?? []),
      ...(finishVariants ?? []),
    ]
  }, [
    isGreenwichBed,
    greenwichBedMatrix,
    activeHeadboardKey,
    visibleWoodVariants,
    headboardFabricsForSampling,
    upholsteryVariants,
    woodVariants,
    finishVariants,
  ])

  const swatchSamplingKey = useMemo(
    () =>
      swatchSamplingVariants
        .filter((v) => v.mainSrc?.trim())
        .map((v) => `${v.key}:${v.mainSrc}`)
        .join("|"),
    [swatchSamplingVariants]
  )

  const swatchSamples = useSwatchColors(
    swatchSamplingKey.split("|").filter(Boolean).length > 1
      ? swatchSamplingVariants
      : undefined
  )

  const showFinish =
    isGreenwichPaint || isProvencePaintWood
      ? showVisibleFinish
      : Boolean(visibleFinishVariants && visibleFinishVariants.length > 1)
  const showExecutionControls =
    showHeadboard || showVisibleUpholstery || showVisibleWood || showFinish
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
      if (!isMain && activeGalleryUrl === url) {
        if (layout === "pdp") {
          setDisplayHeroSrc(variantMain)
          setActiveGalleryUrl(null)
          setHeroFailed(false)
        }
        return
      }
      if (pendingRef.current === url) return
      pendingRef.current = url
      setPendingPreloadUrl(url)
    },
    [activeGalleryUrl, displayHeroSrc, layout, variantMain]
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
      if (isGreenwichBed && greenwichBedMatrix && activeWoodKey && activeUpholsteryKey) {
        const coerced = coerceGreenwichBedSelection(
          greenwichBedMatrix,
          variant.key,
          activeWoodKey,
          activeUpholsteryKey
        )
        setActiveWoodKey(coerced.frameMaterial)
        setActiveUpholsteryKey(coerced.fabric)
        const media = resolveGreenwichBedMedia(
          greenwichBedMatrix,
          coerced.headboard,
          coerced.frameMaterial,
          coerced.fabric
        )
        if (media) {
          applyMediaSelection(media.mainSrc)
          return
        }
      }
      applyMediaSelection(variant.mainSrc.trim())
    },
    [
      activeHeadboardKey,
      activeWoodKey,
      activeUpholsteryKey,
      isGreenwichBed,
      greenwichBedMatrix,
      applyMediaSelection,
    ]
  )

  const onUpholsteryPick = useCallback(
    (variant: CardColorVariant) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (variant.key === activeUpholsteryKey) return
      setActiveUpholsteryKey(variant.key)
      if (isGreenwichBed && greenwichBedMatrix && activeHeadboardKey && activeWoodKey) {
        const coerced = coerceGreenwichBedSelection(
          greenwichBedMatrix,
          activeHeadboardKey,
          activeWoodKey,
          variant.key
        )
        setActiveWoodKey(coerced.frameMaterial)
        setActiveUpholsteryKey(coerced.fabric)
        const media = resolveGreenwichBedMedia(
          greenwichBedMatrix,
          coerced.headboard,
          coerced.frameMaterial,
          coerced.fabric
        )
        if (media) {
          applyMediaSelection(media.mainSrc)
          return
        }
      }
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
      activeHeadboardKey,
      activeWoodKey,
      isGreenwichBed,
      greenwichBedMatrix,
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
      if (isProvencePaintWood) {
        if (activeProvenceMediaKey === "wood") return
        setActiveProvenceMediaKey("wood")
        setActiveWoodKey(variant.key)
        applyMediaSelection(variant.mainSrc)
        return
      }
      if (variant.key === activeWoodKey) return
      setActiveWoodKey(variant.key)
      if (isGreenwichBed && greenwichBedMatrix && activeHeadboardKey) {
        const coerced = coerceGreenwichBedSelection(
          greenwichBedMatrix,
          activeHeadboardKey,
          variant.key,
          activeUpholsteryKey
        )
        setActiveWoodKey(coerced.frameMaterial)
        setActiveUpholsteryKey(coerced.fabric)
        const media = resolveGreenwichBedMedia(
          greenwichBedMatrix,
          coerced.headboard,
          coerced.frameMaterial,
          coerced.fabric
        )
        if (media) {
          applyMediaSelection(media.mainSrc)
          return
        }
      }
      if (isGreenwichPaint && greenwichPaintMatrix && activeFinishKey) {
        const coerced = coerceGreenwichPaintSelection(
          greenwichPaintMatrix,
          activeFinishKey,
          variant.key
        )
        setActiveWoodKey(coerced.frameMaterial)
        const media = resolveGreenwichPaintMedia(
          greenwichPaintMatrix,
          coerced.frameMaterial,
          coerced.paintFinish
        )
        if (media) {
          applyMediaSelection(media.mainSrc)
          return
        }
      }
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
      activeProvenceMediaKey,
      isProvencePaintWood,
      activeHeadboardKey,
      activeUpholsteryKey,
      activeFinishKey,
      isGreenwichBed,
      isGreenwichPaint,
      greenwichBedMatrix,
      greenwichPaintMatrix,
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
      if (isProvencePaintWood) {
        if (activeProvenceMediaKey === "cream") return
        setActiveProvenceMediaKey("cream")
        setActiveFinishKey(variant.key)
        applyMediaSelection(variant.mainSrc)
        return
      }
      if (variant.key === activeFinishKey) return
      setActiveFinishKey(variant.key)
      if (isGreenwichPaint && greenwichPaintMatrix) {
        const coerced = coerceGreenwichPaintSelection(
          greenwichPaintMatrix,
          variant.key,
          activeWoodKey
        )
        setActiveFinishKey(coerced.paintFinish)
        setActiveWoodKey(coerced.frameMaterial)
        const media = resolveGreenwichPaintMedia(
          greenwichPaintMatrix,
          coerced.frameMaterial,
          coerced.paintFinish
        )
        if (media) {
          applyMediaSelection(media.mainSrc)
          return
        }
      }
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
      activeProvenceMediaKey,
      isProvencePaintWood,
      isGreenwichPaint,
      greenwichPaintMatrix,
      activeWoodKey,
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
      <ProductCardSwatchScrollRail
        ariaLabel={ariaLabel}
        stripKey={variants.map((v) => v.key).join("\u0000")}
      >
        {variants.map((variant) => {
          const isActive = variant.key === activeKey
          const token = variant.swatchToken
          const sampled = swatchSamples.get(variant.key)
          const fillColor =
            sampled?.color ||
            variant.swatchHex ||
            fallbackHexForToken(token ?? "neutral")
          return (
            <button
              key={variant.key}
              type="button"
              className={`product-card-execution-swatch${isActive ? " is-active" : ""}`}
              data-swatch-token={token ?? "neutral"}
              data-swatch-source={
                sampled?.source ??
                (variant.swatchHex ? "metadata" : "fallback_token")
              }
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
      </ProductCardSwatchScrollRail>
    </div>
  )

  const heroEmpty = oliverMode && (!displayHeroSrc || heroFailed)
  const isPdp = layout === "pdp"

  const heroImage =
    heroEmpty ? (
      <OliverHeroAbsent />
    ) : !displayHeroSrc ? (
      <div
        className={isPdp ? "product-detail-img skeleton" : "card-img card-img-placeholder"}
        aria-hidden="true"
      />
    ) : (
      <img
        src={displayHeroSrc}
        alt={alt}
        className={isPdp ? "product-detail-img" : "card-img"}
        loading="lazy"
        style={
          isPdp && heroObjectPosition
            ? { objectPosition: heroObjectPosition }
            : undefined
        }
        onError={onHeroError}
      />
    )

  return (
    <div
      className={`product-card-media-switcher${oliverMode ? " oliver-card-media-switcher" : ""}${isPdp ? " product-detail-media-switcher" : ""}`}
    >
      {isPdp ? (
        heroImage
      ) : (
        <Link href={href} className="product-card-media-link card-link" aria-label={alt}>
          {heroImage}
        </Link>
      )}
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
          {showVisibleUpholstery &&
            renderSwatchRow(
              "Обивка",
              "Обивка",
              visibleUpholsteryVariants!,
              activeUpholsteryKey,
              onUpholsteryPick
            )}
          {isGreenwichPaint || isProvencePaintWood ? (
            <>
              {showFinish &&
                renderSwatchRow(
                  finishLabel,
                  finishLabel,
                  visibleFinishVariants!,
                  isProvencePaintWood
                    ? activeProvenceMediaKey === "cream"
                      ? "cream"
                      : null
                    : activeFinishKey,
                  onFinishPick
                )}
              {showVisibleWood &&
                renderSwatchRow(
                  "Дерево",
                  "Дерево",
                  visibleWoodVariants!,
                  isProvencePaintWood
                    ? activeProvenceMediaKey === "wood"
                      ? "wood"
                      : null
                    : activeWoodKey,
                  onWoodPick
                )}
            </>
          ) : (
            <>
              {showVisibleWood &&
                renderSwatchRow(
                  "Дерево",
                  "Дерево",
                  visibleWoodVariants!,
                  activeWoodKey,
                  onWoodPick
                )}
              {showFinish &&
                renderSwatchRow(
                  finishLabel,
                  finishLabel,
                  visibleFinishVariants!,
                  activeFinishKey,
                  onFinishPick
                )}
            </>
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
