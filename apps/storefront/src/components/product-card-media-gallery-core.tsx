"use client"

import Link from "next/link"
import type { MouseEvent, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ProductThumbCarousel } from "@/components/product-thumb-carousel"
import { PdpHeroAffordance } from "@/components/pdp-hero-affordance"
import { PdpImageLightbox } from "@/components/pdp-image-lightbox"
import { useHeroSwipe } from "@/components/use-hero-swipe"
import type { CardColorVariant, CardModelVariant } from "@/lib/card-color-media"
import {
  defaultGreenwichBedSelection,
  resolveGreenwichBedMedia,
  coerceGreenwichBedSelection,
  availableWoodKeysForHeadboard,
  availableFabricKeysForHeadboard,
  availableFabricKeysForHeadboardAnyWood,
  buildGreenwichBedSwatchVariants,
  coerceGreenwichBedSelectionFabricFirst,
  type GreenwichBedMatrixEntry,
} from "@/lib/greenwich-bed-media"
import {
  availableFrameKeysForPaint,
  coerceGreenwichPaintSelection,
  defaultGreenwichPaintSelection,
  isGreenwichPaintProductHandle,
  resolveGreenwichPaintMedia,
  type GreenwichPaintMatrixEntry,
} from "@/lib/greenwich-paint-media"
import {
  buildPdpGalleryPhotoSet,
  resolveBuyerGalleryThumbStrip,
  shouldShowBuyerGalleryRail,
} from "@/lib/pdp-gallery-photo-set"
import {
  buildGalleryStripUrls,
  buildPdpThumbStripUrls,
  resolveCardHeroAndNearDuplicateExtras,
  resolveStorefrontProductImageSrc,
} from "@/lib/product-images"
import {
  resolveCatalogCardHeroSrc,
  resolveCatalogCardMediaBundle,
} from "@/lib/catalog-card-image"
import { useVerifiedStripExtras } from "@/components/use-verified-strip-extras"
import { CARD_STRIP_IMAGE_PROBE_LIMIT } from "@/lib/client/extra-image-url-verify"
import { useSwatchColors } from "@/lib/use-swatch-colors"
import { fallbackHexForToken } from "@/lib/swatch-fallback-colors"
import {
  clearPdpExecutionSelection,
  publishPdpExecutionSelection,
  type PdpExecutionSpec,
} from "@/lib/cart/pdp-selection"
import { pdpLightboxCopy, states } from "@/lib/woodright-copy"

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
  /** Oliver standalone bed: one labeled row per fabric variant. */
  separateFabricRows?: CardColorVariant[]
  /** Greenwich bed matrix — scoped hero + gallery per headboard/wood/fabric. */
  greenwichBedMatrix?: GreenwichBedMatrixEntry[]
  /** Greenwich paint matrix — scoped hero + gallery per wood/paint. */
  greenwichPaintMatrix?: GreenwichPaintMatrixEntry[]
  layout?: "card" | "pdp"
  heroObjectPosition?: string
  /** PERF-08: first above-fold card hero — high fetch priority, not lazy. */
  priorityHero?: boolean
  /** Product handle for evidence-backed near-dup collapse. */
  productHandle?: string
}

function resolveCombinedMedia(
  mainSrc: string,
  extraSrcs: string[],
  headboard: CardModelVariant | null | undefined,
  upholstery: CardColorVariant | null | undefined,
  wood: CardColorVariant | null | undefined,
  finish: CardColorVariant | null | undefined
): { mainSrc: string; extraSrcs: string[] } {
  /* Strict execution scope: selected variant extras win even when []. Parent
     extras apply only when no execution media is selected. */
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
    <div className="card-img oliver-media-absent" aria-label="Фото скоро появится">
      <span className="oliver-media-absent-label">{states.noPhoto}</span>
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
  separateFabricRows,
  oliverMode = false,
  greenwichBedMatrix,
  greenwichPaintMatrix,
  layout = "card",
  heroObjectPosition,
  priorityHero = false,
  productHandle,
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

  const hasSeparateFabricRows = Boolean(
    separateFabricRows && separateFabricRows.length >= 2
  )

  const [activeSeparateFabricKey, setActiveSeparateFabricKey] = useState<string | null>(
    () => separateFabricRows?.[0]?.key ?? null
  )

  const activeSeparateFabric = useMemo(() => {
    if (!hasSeparateFabricRows || !separateFabricRows) return null
    return (
      separateFabricRows.find((v) => v.key === activeSeparateFabricKey) ??
      separateFabricRows[0]
    )
  }, [activeSeparateFabricKey, separateFabricRows, hasSeparateFabricRows])

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const pendingRef = useRef<string | null>(null)
  const executionSwapSeqRef = useRef(0)
  const executionHeroPreloadRef = useRef<Map<string, Promise<boolean>>>(
    new Map()
  )
  const activeHeadboardKeyRef = useRef(activeHeadboardKey)
  const activeUpholsteryKeyRef = useRef(activeUpholsteryKey)
  const activeWoodKeyRef = useRef(activeWoodKey)
  const activeFinishKeyRef = useRef(activeFinishKey)
  // PDP-only: color/wood/upholstery swatches render below the CTA buttons in
  // .product-detail-info (not stacked under the hero photo) — the swatch UI
  // itself never moves in the DOM, it's teleported via portal into a slot
  // rendered by the PDP page below <ProductCta>. SSR-safe: the slot only
  // exists once mounted in the browser, so this stays null during the
  // server-rendered/hydration pass and the portal appears after mount.
  const [pdpSwatchSlot, setPdpSwatchSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    activeHeadboardKeyRef.current = activeHeadboardKey
    activeUpholsteryKeyRef.current = activeUpholsteryKey
    activeWoodKeyRef.current = activeWoodKey
    activeFinishKeyRef.current = activeFinishKey
  }, [
    activeHeadboardKey,
    activeUpholsteryKey,
    activeWoodKey,
    activeFinishKey,
  ])

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
    if (isGreenwichBed &&
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
      if (fromMatrix) {
        // Catalog projection may slim matrix urls to [main]; keep same-token
        // enriched upholstery extras only — never unscoped parent extraSrcs.
        if (fromMatrix.extraSrcs.length > 0) return fromMatrix
        const scoped = activeUpholstery?.extraSrcs?.length
          ? activeUpholstery.extraSrcs
          : []
        return { mainSrc: fromMatrix.mainSrc, extraSrcs: scoped }
      }
    }
    if (isGreenwichPaint && greenwichPaintMatrix && activeWoodKey && activeFinishKey) {
      const fromPaint = resolveGreenwichPaintMedia(
        greenwichPaintMatrix,
        activeWoodKey,
        activeFinishKey
      )
      if (fromPaint) {
        if (fromPaint.extraSrcs.length > 0) return fromPaint
        // Slim catalog finish urls:[main] - same-token enriched finish only.
        const scoped = activeFinish?.extraSrcs?.length
          ? activeFinish.extraSrcs
          : []
        return { mainSrc: fromPaint.mainSrc, extraSrcs: scoped }
      }
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
      hasSeparateFabricRows ? activeSeparateFabric : activeUpholstery,
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
    activeSeparateFabric,
    hasSeparateFabricRows,
    activeFinish,
  ])
  const variantMain = resolved.mainSrc
  const variantExtras = resolved.extraSrcs

  /** Evidence-backed near-dup collapse (card + PDP). No blind iso pairing. */
  const cardQualityMedia = useMemo(() => {
    const displayMedia =
      layout === "pdp"
        ? { mainSrc: variantMain, extraSrcs: variantExtras }
        : resolveCatalogCardMediaBundle(
            variantMain,
            variantExtras,
            resolveStorefrontProductImageSrc
          )
    return resolveCardHeroAndNearDuplicateExtras(
      displayMedia.mainSrc,
      displayMedia.extraSrcs,
      productHandle
    )
  }, [layout, variantMain, variantExtras, productHandle])

  const galleryStripCandidates = useMemo(() => {
    // Card: main-first so return-to-main is a real thumb (hero is a Link).
    // PDP: extras-only - hero already fills the large slot; return via re-click
    // on the active extra. Do NOT put main in the PDP strip:
    // that reads as a duplicate and, with near-dup collapse, can hide the rail.
    if (layout === "pdp") {
      return buildPdpThumbStripUrls(
        cardQualityMedia.mainSrc,
        cardQualityMedia.extraSrcs
      )
    }
    return buildGalleryStripUrls(
      cardQualityMedia.mainSrc,
      cardQualityMedia.extraSrcs
    )
  }, [layout, cardQualityMedia])

  /** Hero after evidence near-dup resolve (card + PDP). */
  const effectiveMain = cardQualityMedia.mainSrc

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
          : (() => {
              const combined = resolveCombinedMedia(
                mainSrc,
                extraSrcs,
                headboardVariants?.[0],
                upholsteryVariants?.[0],
                woodVariants?.[0],
                finishVariants?.[0]
              )
              return resolveCardHeroAndNearDuplicateExtras(
                combined.mainSrc,
                combined.extraSrcs,
                productHandle
              )
            })()
    const initialMain = initial?.mainSrc?.trim() ?? mainSrc.trim()
    setDisplayHeroSrc(
      layout === "pdp"
        ? initialMain
        : resolveCatalogCardHeroSrc(
            initialMain,
            resolveStorefrontProductImageSrc
          )
    )
    setHeroFailed(false)
    setActiveGalleryUrl(null)
    setFailedExtras(new Set())
    pendingRef.current = null
    executionSwapSeqRef.current += 1
    executionHeroPreloadRef.current.clear()
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
    productHandle,
    layout,
    isProvencePaintWood,
  ])

  // Catalog: keep hero on the quality-resolved main when execution selection changes
  // (unless the shopper already picked a strip thumb).
  useEffect(() => {
    if (layout === "pdp") return
    if (activeGalleryUrl != null) return
    const next = cardQualityMedia.mainSrc.trim()
    if (!next) return
    setDisplayHeroSrc(next)
    setHeroFailed(false)
  }, [layout, cardQualityMedia.mainSrc, activeGalleryUrl])

  const resolveMatrixMain = useCallback(
    (hb: string, wood: string, fabric: string) => {
      if (!greenwichBedMatrix) return null
      return resolveGreenwichBedMedia(greenwichBedMatrix, hb, wood, fabric)
    },
    [greenwichBedMatrix]
  )

  useEffect(() => {
    if (layout !== "pdp") return
    setPdpSwatchSlot(document.getElementById("pdp-color-options-slot"))
  }, [layout])

  // Buyer strips are optimistic (no Image() stampede). Broken thumbs prune
  // themselves via onError. PDP must not clear/rebuild the rail on every
  // execution switch - that reflows the hero column and causes visible shake.
  const isPdpLayout = layout === "pdp"

  const [cardStripProbeEnabled, setCardStripProbeEnabled] = useState(true)

  const enableCardStripProbes = useCallback(() => {
    if (!isPdpLayout) setCardStripProbeEnabled(true)
  }, [isPdpLayout])

  const stripProbeCandidates = useMemo(() => {
    // Cards: hero <img> already proved effectiveMain — keep it out of the
    // optimistic probe list so the rail can still prepend it via force-keep.
    if (layout === "pdp" || !effectiveMain) return galleryStripCandidates
    return galleryStripCandidates.filter((u) => u !== effectiveMain)
  }, [layout, galleryStripCandidates, effectiveMain])

  const rawVisibleStrip = useVerifiedStripExtras(
    stripProbeCandidates,
    failedExtras,
    isPdpLayout
      ? { mode: "optimistic" }
      : {
          maxProbes: CARD_STRIP_IMAGE_PROBE_LIMIT,
          enabled: cardStripProbeEnabled,
          // Catalog: never Image()-probe the whole grid — it starves hero loads.
          mode: "optimistic",
        }
  )
  // Defense in depth: if hero is a strip candidate (catalog always; some PDP
  // paths), never let Image() probe failures drop it — the hero <img> already
  // proved the URL. Keeps return-to-main reachable on cards.
  const visibleStrip = useMemo(() => {
    if (!effectiveMain || !galleryStripCandidates.includes(effectiveMain)) {
      return rawVisibleStrip
    }
    if (rawVisibleStrip.includes(effectiveMain)) return rawVisibleStrip
    return [effectiveMain, ...rawVisibleStrip.filter((u) => u !== effectiveMain)]
  }, [rawVisibleStrip, galleryStripCandidates, effectiveMain])

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
      availableFabricKeysForHeadboardAnyWood(
        greenwichBedMatrix,
        activeHeadboardKey
      )
    )
    return upholsteryVariants.filter((v) => allowed.has(v.key))
  }, [
    isGreenwichBed,
    greenwichBedMatrix,
    activeHeadboardKey,
    upholsteryVariants,
  ])
  const showVisibleUpholstery =
    Boolean(visibleUpholsteryVariants && visibleUpholsteryVariants.length > 1)
  const showVisibleWood = Boolean(
    visibleWoodVariants &&
      (isGreenwichPaint || isProvencePaintWood
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
      ...(separateFabricRows ?? []),
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
    separateFabricRows,
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
      : undefined,
    // Metadata/token colors cover buyer-facing rows. Never Image()/canvas
    // sample full product heroes: PDP sampling used to download the whole
    // execution matrix and compete with the selected hero.
    { enabled: false }
  )

  const showFinish =
    isGreenwichPaint || isProvencePaintWood
      ? showVisibleFinish
      : Boolean(visibleFinishVariants && visibleFinishVariants.length > 1)
  const showSeparateFabricRows = hasSeparateFabricRows
  const showExecutionControls =
    showHeadboard ||
    showSeparateFabricRows ||
    showVisibleUpholstery ||
    showVisibleWood ||
    showFinish
  /* Always show the gallery rail when there is at least one photo (including
     single-photo SKUs). PDP multi-photo stays extras-only; single-photo PDP
     falls back to main as the only thumb. */
  const thumbStrip = useMemo(
    () => resolveBuyerGalleryThumbStrip(effectiveMain, visibleStrip),
    [effectiveMain, visibleStrip]
  )
  const showThumbRow = shouldShowBuyerGalleryRail(thumbStrip)
  const pdpGalleryPhotos = useMemo(
    () =>
      layout === "pdp"
        ? buildPdpGalleryPhotoSet(effectiveMain, visibleStrip)
        : visibleStrip,
    [layout, effectiveMain, visibleStrip]
  )

  const preloadExecutionHero = useCallback((src: string): Promise<boolean> => {
    const normalized = src.trim()
    if (!normalized || typeof Image === "undefined") {
      return Promise.resolve(false)
    }
    const cached = executionHeroPreloadRef.current.get(normalized)
    if (cached) return cached

    let pending: Promise<boolean>
    pending = new Promise<boolean>((resolve) => {
      const image = new Image()
      image.decoding = "async"
      let settled = false
      let decodeStarted = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        if (
          !ok &&
          executionHeroPreloadRef.current.get(normalized) === pending
        ) {
          executionHeroPreloadRef.current.delete(normalized)
        }
        resolve(ok)
      }
      const decode = () => {
        if (decodeStarted) return
        decodeStarted = true
        if (typeof image.decode !== "function") {
          finish(image.naturalWidth > 0)
          return
        }
        image.decode().then(() => finish(true)).catch(() => {
          finish(image.naturalWidth > 0)
        })
      }
      image.onload = decode
      image.onerror = () => finish(false)
      image.src = normalized
      if (image.complete && image.naturalWidth > 0) decode()
    })
    executionHeroPreloadRef.current.set(normalized, pending)
    return pending
  }, [])

  /* Greenwich wood toggles should feel immediate even on a cold connection.
     Prewarm only the alternate frame for the active paint (at most one image),
     not the whole matrix. Catalog uses the small card derivative; PDP keeps the
     full source image. */
  useEffect(() => {
    if (
      !isGreenwichPaint ||
      !greenwichPaintMatrix ||
      !activeFinishKey ||
      typeof Image === "undefined"
    ) {
      return
    }
    for (const frame of availableFrameKeysForPaint(
      greenwichPaintMatrix,
      activeFinishKey
    )) {
      if (frame === activeWoodKey) continue
      const media = resolveGreenwichPaintMedia(
        greenwichPaintMatrix,
        frame,
        activeFinishKey
      )
      if (!media?.mainSrc) continue
      const src =
        layout === "pdp"
          ? media.mainSrc
          : resolveCatalogCardHeroSrc(
              media.mainSrc,
              resolveStorefrontProductImageSrc
            )
      void preloadExecutionHero(src)
    }
  }, [
    layout,
    isGreenwichPaint,
    greenwichPaintMatrix,
    activeFinishKey,
    activeWoodKey,
    preloadExecutionHero,
  ])

  /* Warm the first few PDP alternatives after initial paint. Hover/focus below
     covers the rest without downloading an entire 12-color matrix up front. */
  useEffect(() => {
    if (layout !== "pdp" || typeof navigator === "undefined") return
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string }
      }
    ).connection
    if (
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g"
    ) {
      return
    }
    const candidates = [
      ...(headboardVariants ?? []),
      ...(upholsteryVariants ?? []),
      ...(woodVariants ?? []),
      ...(finishVariants ?? []),
    ]
      .map((variant) => variant.mainSrc?.trim())
      .filter((src): src is string => Boolean(src && src !== displayHeroSrc))
      .filter((src, index, all) => all.indexOf(src) === index)
      .slice(0, 4)
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const src of candidates) {
          if (cancelled) return
          await preloadExecutionHero(src)
        }
      })()
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    layout,
    headboardVariants,
    upholsteryVariants,
    woodVariants,
    finishVariants,
    displayHeroSrc,
    preloadExecutionHero,
  ])

  const applyMediaSelection = useCallback(
    (nextMain: string) => {
      const normalized = nextMain.trim()
      setActiveGalleryUrl(null)
      setHeroFailed(false)
      setFailedExtras(new Set())
      pendingRef.current = null
      setPendingPreloadUrl(null)

      const seq = executionSwapSeqRef.current + 1
      executionSwapSeqRef.current = seq
      if (layout !== "pdp" || !normalized || typeof Image === "undefined") {
        setDisplayHeroSrc(
          layout === "pdp"
            ? normalized
            : resolveCatalogCardHeroSrc(
                normalized,
                resolveStorefrontProductImageSrc
              )
        )
        return
      }

      /* Keep the current PDP hero painted until the selected execution image
         is downloaded and decoded. This avoids a blank/repaint jump inside the
         fixed contain box. Sequence gating makes rapid clicks last-write-wins. */
      void preloadExecutionHero(normalized).then((ready) => {
        if (executionSwapSeqRef.current !== seq) return
        if (!ready) {
          // The selector already represents the requested execution. Never
          // leave the previous execution photo painted as if it still matched.
          setDisplayHeroSrc("")
          setHeroFailed(true)
          return
        }
        setDisplayHeroSrc(normalized)
      })
    },
    [layout, preloadExecutionHero]
  )

  const onHeroError = useCallback(() => {
    if (oliverMode && displayHeroSrc === effectiveMain) {
      setHeroFailed(true)
      return
    }
    setDisplayHeroSrc(effectiveMain)
    setActiveGalleryUrl(null)
    setHeroFailed(false)
  }, [displayHeroSrc, oliverMode, effectiveMain])

  const onThumbPick = useCallback(
    (url: string, isMain: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      executionSwapSeqRef.current += 1
      if (isMain) {
        if (activeGalleryUrl === null && displayHeroSrc === effectiveMain) return
        setDisplayHeroSrc(effectiveMain)
        setActiveGalleryUrl(null)
        setHeroFailed(false)
        pendingRef.current = null
        setPendingPreloadUrl(null)
        return
      }
      if (activeGalleryUrl === url) {
        // Re-click active extra → return to main (card + PDP). Cards also keep
        // main in the strip; this is a second path if the main thumb is missed.
        setDisplayHeroSrc(effectiveMain)
        setActiveGalleryUrl(null)
        setHeroFailed(false)
        pendingRef.current = null
        setPendingPreloadUrl(null)
        return
      }
      if (pendingRef.current === url) return
      pendingRef.current = url
      setPendingPreloadUrl(url)
    },
    [activeGalleryUrl, displayHeroSrc, effectiveMain]
  )

  const onPreloadLoad = useCallback(() => {
    const u = pendingRef.current
    if (!u) return
    setDisplayHeroSrc(u)
    setHeroFailed(false)
    setActiveGalleryUrl(u === effectiveMain ? null : u)
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [effectiveMain])

  const onPreloadError = useCallback(() => {
    const u = pendingRef.current
    pendingRef.current = null
    setPendingPreloadUrl(null)
    if (!u) return
    if (u === effectiveMain) return
    setFailedExtras((prev) => new Set(prev).add(u))
  }, [effectiveMain])

  const onHeadboardPick = useCallback(
    (variant: CardModelVariant) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (variant.key === activeHeadboardKey) return
      setActiveHeadboardKey(variant.key)
      activeHeadboardKeyRef.current = variant.key
      if (
        isGreenwichBed &&
        greenwichBedMatrix &&
        activeWoodKeyRef.current &&
        activeUpholsteryKeyRef.current
      ) {
        const coerced = coerceGreenwichBedSelection(
          greenwichBedMatrix,
          variant.key,
          activeWoodKeyRef.current,
          activeUpholsteryKeyRef.current
        )
        setActiveWoodKey(coerced.frameMaterial)
        setActiveUpholsteryKey(coerced.fabric)
        activeWoodKeyRef.current = coerced.frameMaterial
        activeUpholsteryKeyRef.current = coerced.fabric
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

  const onSeparateFabricPick = useCallback(
    (variant: CardColorVariant) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setActiveSeparateFabricKey(variant.key)
      applyMediaSelection(variant.mainSrc.trim())
    },
    [applyMediaSelection]
  )

  const onUpholsteryPick = useCallback(
    (variant: CardColorVariant) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setActiveUpholsteryKey(variant.key)
      activeUpholsteryKeyRef.current = variant.key
      if (
        isGreenwichBed &&
        greenwichBedMatrix &&
        activeHeadboardKeyRef.current &&
        activeWoodKeyRef.current
      ) {
        const coerced = coerceGreenwichBedSelectionFabricFirst(
          greenwichBedMatrix,
          activeHeadboardKeyRef.current,
          variant.key,
          activeWoodKeyRef.current
        )
        setActiveWoodKey(coerced.frameMaterial)
        setActiveUpholsteryKey(coerced.fabric)
        activeWoodKeyRef.current = coerced.frameMaterial
        activeUpholsteryKeyRef.current = coerced.fabric
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
      const selectedMain = variant.mainSrc.trim()
      if (selectedMain) {
        applyMediaSelection(selectedMain)
        return
      }
      applyMediaSelection(
        resolveCombinedMedia(
          mainSrc,
          extraSrcs,
          activeHeadboard,
          variant,
          activeWood,
          activeFinish
        ).mainSrc
      )
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
        setActiveProvenceMediaKey("wood")
        setActiveWoodKey(variant.key)
        activeWoodKeyRef.current = variant.key
        applyMediaSelection(variant.mainSrc)
        return
      }
      setActiveWoodKey(variant.key)
      activeWoodKeyRef.current = variant.key
      if (isGreenwichBed && greenwichBedMatrix && activeHeadboardKeyRef.current) {
        const coerced = coerceGreenwichBedSelection(
          greenwichBedMatrix,
          activeHeadboardKeyRef.current,
          variant.key,
          activeUpholsteryKeyRef.current
        )
        setActiveWoodKey(coerced.frameMaterial)
        setActiveUpholsteryKey(coerced.fabric)
        activeWoodKeyRef.current = coerced.frameMaterial
        activeUpholsteryKeyRef.current = coerced.fabric
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
      if (
        isGreenwichPaint &&
        greenwichPaintMatrix &&
        activeFinishKeyRef.current
      ) {
        const coerced = coerceGreenwichPaintSelection(
          greenwichPaintMatrix,
          activeFinishKeyRef.current,
          variant.key
        )
        setActiveWoodKey(coerced.frameMaterial)
        activeWoodKeyRef.current = coerced.frameMaterial
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
      const selectedMain = variant.mainSrc.trim()
      if (selectedMain) {
        applyMediaSelection(selectedMain)
        return
      }
      applyMediaSelection(
        resolveCombinedMedia(
          mainSrc,
          extraSrcs,
          activeHeadboard,
          activeUpholstery,
          variant,
          activeFinish
        ).mainSrc
      )
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
        setActiveProvenceMediaKey("cream")
        setActiveFinishKey(variant.key)
        activeFinishKeyRef.current = variant.key
        applyMediaSelection(variant.mainSrc)
        return
      }
      setActiveFinishKey(variant.key)
      activeFinishKeyRef.current = variant.key
      if (isGreenwichPaint && greenwichPaintMatrix) {
        const coerced = coerceGreenwichPaintSelection(
          greenwichPaintMatrix,
          variant.key,
          activeWoodKeyRef.current
        )
        setActiveFinishKey(coerced.paintFinish)
        setActiveWoodKey(coerced.frameMaterial)
        activeFinishKeyRef.current = coerced.paintFinish
        activeWoodKeyRef.current = coerced.frameMaterial
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
      const selectedMain = variant.mainSrc.trim()
      if (selectedMain) {
        applyMediaSelection(selectedMain)
        return
      }
      applyMediaSelection(
        resolveCombinedMedia(
          mainSrc,
          extraSrcs,
          activeHeadboard,
          activeUpholstery,
          activeWood,
          variant
        ).mainSrc
      )
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
    onPick: (v: CardColorVariant) => (e: MouseEvent<HTMLButtonElement>) => void,
    options: { imageSwatches?: boolean; rowKey?: string } = {}
  ) => {
    /* PDP option-group heading pattern: label + currently selected value.
       Catalog cards keep the compact label-only strip. */
    const activeValueLabel =
      layout === "pdp"
        ? (variants.find((v) => v.key === activeKey)?.label ?? null)
        : null
    return (
    <div
      key={options.rowKey}
      className="product-card-selector-section"
      role="toolbar"
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="product-card-selector-label">
        {label}
        {activeValueLabel != null && activeValueLabel !== label && (
          <span className="product-card-selector-value">{activeValueLabel}</span>
        )}
      </span>
      <ProductCardSwatchScrollRail
        ariaLabel={ariaLabel}
        stripKey={variants.map((v) => v.key).join("\u0000")}
      >
        {variants.map((variant) => {
          const isActive = variant.key === activeKey
          const token = variant.swatchToken
          const sampled = swatchSamples.get(variant.key)
          const imageSrc = (variant.mainSrc?.trim() || sampled?.imageUrl?.trim()) ?? ""
          // Image swatches: only when the row opts in (Oliver fabric closeups via
          // separateFabricRows). «Обивка» must not opt in — Greenwich fills
          // mainSrc with whole-bed heroes that look like mini product thumbs.
          const useImageSwatch = Boolean(options.imageSwatches && imageSrc)
          // Catalog: never use image-sampled colors. Prefer curated hex, then token.
          const fillColor =
            variant.swatchHex?.trim() ||
            (layout === "pdp" ? sampled?.color : undefined) ||
            fallbackHexForToken(token ?? "neutral")
          return (
            <button
              key={variant.key}
              type="button"
              className={`product-card-execution-swatch${isActive ? " is-active" : ""}`}
              data-swatch-token={token ?? "neutral"}
              data-swatch-source={
                useImageSwatch
                  ? "fabric_image"
                  : variant.swatchHex?.trim()
                    ? "metadata"
                    : layout === "pdp" && sampled?.source
                      ? sampled.source
                      : "fallback_token"
              }
              aria-pressed={isActive}
              aria-label={variant.label}
              title={variant.label}
              onPointerEnter={() => {
                if (layout === "pdp" && variant.mainSrc?.trim()) {
                  void preloadExecutionHero(variant.mainSrc)
                }
              }}
              onFocus={() => {
                if (layout === "pdp" && variant.mainSrc?.trim()) {
                  void preloadExecutionHero(variant.mainSrc)
                }
              }}
              onTouchStart={() => {
                if (layout === "pdp" && variant.mainSrc?.trim()) {
                  void preloadExecutionHero(variant.mainSrc)
                }
              }}
              onClick={onPick(variant)}
            >
              {useImageSwatch ? (
                <img
                  src={imageSrc}
                  alt=""
                  aria-hidden="true"
                  className="product-card-execution-swatch-img"
                />
              ) : (
                <span
                  className="product-card-execution-swatch-fill"
                  aria-hidden="true"
                  style={{ backgroundColor: fillColor }}
                />
              )}
            </button>
          )
        })}
      </ProductCardSwatchScrollRail>
    </div>
    )
  }

  const heroEmpty = oliverMode && (!displayHeroSrc || heroFailed)
  const isPdp = layout === "pdp"

  /* PDP: publish the current execution choice (photo + shown selector values)
     for ProductCta's add-to-cart — the cart page renders the thumbnail and
     spec lines from this. Only user-visible selectors are published, so a
     product without swatches contributes no noise. */
  useEffect(() => {
    if (!isPdp) return
    const specs: PdpExecutionSpec[] = []
    if (showHeadboard && activeHeadboard) {
      specs.push({ label: "Изголовье", value: activeHeadboard.label })
    }
    if (showSeparateFabricRows && activeSeparateFabric) {
      specs.push({ label: "Обивка", value: activeSeparateFabric.label })
    } else if (showVisibleUpholstery && activeUpholstery) {
      specs.push({ label: "Обивка", value: activeUpholstery.label })
    }
    if (isProvencePaintWood) {
      const provenceActive =
        activeProvenceMediaKey === "wood" ? woodVariants?.[0] : finishVariants?.[0]
      if (provenceActive) {
        specs.push({
          label: activeProvenceMediaKey === "wood" ? "Дерево" : finishLabel,
          value: provenceActive.label,
        })
      }
    } else {
      if (showVisibleWood && activeWood) {
        specs.push({ label: "Дерево", value: activeWood.label })
      }
      if (showFinish && activeFinish) {
        specs.push({ label: finishLabel, value: activeFinish.label })
      }
    }
    publishPdpExecutionSelection({ imageSrc: variantMain || undefined, specs })
  }, [
    isPdp,
    variantMain,
    showHeadboard,
    activeHeadboard,
    showSeparateFabricRows,
    activeSeparateFabric,
    showVisibleUpholstery,
    activeUpholstery,
    showVisibleWood,
    activeWood,
    showFinish,
    activeFinish,
    finishLabel,
    isProvencePaintWood,
    activeProvenceMediaKey,
    woodVariants,
    finishVariants,
  ])

  useEffect(() => {
    if (!isPdp) return
    return () => clearPdpExecutionSelection()
  }, [isPdp])

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
        className={`${isPdp ? "product-detail-img" : "card-img"}${isPdp ? " is-zoomable" : ""}`}
        loading={priorityHero && !isPdp ? "eager" : "lazy"}
        fetchPriority={priorityHero && !isPdp ? "high" : undefined}
        style={
          isPdp && heroObjectPosition
            ? { objectPosition: heroObjectPosition }
            : undefined
        }
        onError={onHeroError}
      />
    )

  const pdpLightboxImages =
    pdpGalleryPhotos.length > 0 ? pdpGalleryPhotos : displayHeroSrc ? [displayHeroSrc] : []
  const openLightbox = useCallback(() => {
    if (!isPdp || heroEmpty || !displayHeroSrc) return
    const idx = pdpLightboxImages.indexOf(displayHeroSrc)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }, [isPdp, heroEmpty, displayHeroSrc, pdpLightboxImages])

  const heroCycle = pdpGalleryPhotos
  const stepHero = useCallback(
    (dir: 1 | -1) => {
      if (heroCycle.length < 2) return
      const i = heroCycle.indexOf(displayHeroSrc)
      const next =
        heroCycle[
          (((i < 0 ? 0 : i) + dir) % heroCycle.length + heroCycle.length) % heroCycle.length
        ]!
      if (next === effectiveMain) {
        setDisplayHeroSrc(effectiveMain)
        setActiveGalleryUrl(null)
        setHeroFailed(false)
        pendingRef.current = null
        setPendingPreloadUrl(null)
        return
      }
      if (pendingRef.current === next) return
      pendingRef.current = next
      setPendingPreloadUrl(next)
    },
    [heroCycle, displayHeroSrc, effectiveMain]
  )

  const heroSwipe = useHeroSwipe(
    isPdp && heroCycle.length > 1,
    () => stepHero(-1),
    () => stepHero(1)
  )

  const executionControlsMarkup = showExecutionControls ? (
        <div className="product-card-execution-controls">
          {showHeadboard && (
            <div
              className="product-card-selector-section"
              role="toolbar"
              aria-label="Изголовье"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="product-card-selector-label">
                Изголовье
                {isPdp && activeHeadboard != null && (
                  <span className="product-card-selector-value">
                    {activeHeadboard.label}
                  </span>
                )}
              </span>
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
          {showSeparateFabricRows &&
            separateFabricRows!.map((variant) =>
              renderSwatchRow(
                variant.label,
                variant.label,
                [variant],
                activeSeparateFabricKey,
                onSeparateFabricPick,
                { imageSwatches: true, rowKey: variant.key }
              )
            )}
          {showVisibleUpholstery &&
            renderSwatchRow(
              "Обивка",
              "Обивка",
              visibleUpholsteryVariants!,
              activeUpholsteryKey,
              onUpholsteryPick
              /* Color chips (curated swatchHex). Do NOT pass imageSwatches:
                 Greenwich bed matrix fills mainSrc with whole-bed heroes, which
                 rendered as misleading mini product photos. Fabric closeups use
                 separateFabricRows + imageSwatches instead (Oliver). */
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
          ) : isGreenwichPaintProductHandle(productHandle) &&
            showFinish &&
            showVisibleWood ? (
            /* Catalog without matrix still must keep Color-then-Wood order. */
            <>
              {renderSwatchRow(
                finishLabel,
                finishLabel,
                visibleFinishVariants!,
                activeFinishKey,
                onFinishPick
              )}
              {renderSwatchRow(
                "Дерево",
                "Дерево",
                visibleWoodVariants!,
                activeWoodKey,
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
  ) : null

  const thumbRowMarkup = showThumbRow ? (
    <ProductThumbCarousel
      variantMain={effectiveMain}
      visibleStrip={thumbStrip}
      activeGalleryUrl={activeGalleryUrl}
      displayHeroSrc={displayHeroSrc}
      pendingPreloadUrl={pendingPreloadUrl}
      onThumbPick={onThumbPick}
      onThumbError={(url) => {
        if (url === effectiveMain) return
        setFailedExtras((prev) => {
          const next = new Set(prev)
          next.add(url)
          return next
        })
      }}
    />
  ) : null

  return (
    <div
      className={`product-card-media-switcher${oliverMode ? " oliver-card-media-switcher" : ""}${isPdp ? " product-detail-media-switcher" : ""}`}
      onPointerEnter={isPdp ? undefined : enableCardStripProbes}
    >
      {isPdp ? (
        <div className="product-pdp-media-hero" {...heroSwipe}>
          {heroEmpty || !displayHeroSrc ? (
            heroImage
          ) : (
            <button
              type="button"
              className="pdp-hero-open"
              onClick={openLightbox}
              aria-label={`${alt} - ${pdpLightboxCopy.open}`}
            >
              {heroImage}
              <PdpHeroAffordance count={pdpLightboxImages.length} />
            </button>
          )}
        </div>
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
      {isPdp ? (
        <>
          {executionControlsMarkup && pdpSwatchSlot
            ? createPortal(executionControlsMarkup, pdpSwatchSlot)
            : null}
          {thumbRowMarkup}
        </>
      ) : (
        <div className="product-card-rails">
          {executionControlsMarkup}
          {thumbRowMarkup}
        </div>
      )}
      {isPdp && lightboxIndex !== null && (
        <PdpImageLightbox
          images={pdpLightboxImages}
          activeIndex={lightboxIndex}
          alt={alt}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  )
}
