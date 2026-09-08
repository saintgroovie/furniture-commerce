"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import type { PromotionSlotPayload } from "@/lib/api/promotion-slot"
import { resolveCatalogCardHeroSrc } from "@/lib/catalog-card-image"
import { formatRub } from "@/lib/format"
import { formatRuInline } from "@/lib/format-ru-copy"
import {
  getBuyerFacingProductTitle,
  getCollectionLabel,
  getSubcollectionLabel,
} from "@/lib/product-metadata"
import {
  normalizeImageEntryUrl,
  resolveStorefrontProductImageSrc,
} from "@/lib/product-images"
import {
  clampRotationInterval,
  initialRotationState,
  isRotationRunning,
  rotationReducer,
} from "@/lib/promotion-rotation"
import { promotionCopy } from "@/lib/woodright-copy"

type Props = {
  slot: PromotionSlotPayload
}

type PromoView = {
  id: string
  href: string
  title: string
  context: string | null
  imageSrc: string | null
  salePrice: number
  originalPrice: number
  percent: number
  priceFrom: boolean
}

function heroSrc(product: Record<string, unknown>): string | null {
  const thumb = typeof product.thumbnail === "string" ? product.thumbnail.trim() : ""
  if (thumb) return resolveCatalogCardHeroSrc(thumb, resolveStorefrontProductImageSrc)
  const images = product.images
  if (Array.isArray(images) && images.length > 0) {
    const u = normalizeImageEntryUrl(images[0])
    if (u) return resolveCatalogCardHeroSrc(u, resolveStorefrontProductImageSrc)
  }
  return null
}

function toViews(slot: PromotionSlotPayload): PromoView[] {
  const out: PromoView[] = []
  for (const item of slot.items) {
    const product = item.product
    const id = typeof product.id === "string" ? product.id : item.product_id
    const src = heroSrc(product)
    if (!src) continue
    const meta = product.metadata as Record<string, unknown> | undefined
    const cfg = meta?.buyer_default_configuration as
      | { material_execution_code?: unknown }
      | undefined
    const productType = (product.product_classification as { product_type?: string } | undefined)
      ?.product_type
    const parts = [getCollectionLabel(product), getSubcollectionLabel(product)].filter(Boolean)
    out.push({
      id,
      href: `/product/${id}`,
      title: getBuyerFacingProductTitle(product),
      context: parts.length > 0 ? parts.join(" · ") : null,
      imageSrc: src,
      salePrice: item.sale_price,
      originalPrice: item.original_price,
      percent: item.discount_percent,
      priceFrom:
        Boolean(cfg && typeof cfg.material_execution_code === "string") ||
        productType === "CONFIGURABLE",
    })
  }
  return out
}

/**
 * Catalog Promotion Window - a separate rotating card in the right gutter
 * next to the product grid (not a grid cell; placement contract in
 * `lib/promotion-window-placement.ts`). Reuses ProductCard primitives
 * (media / thumb rail / body) in a compact ≤200px column. Crossfade between
 * stacked images (no layout shift), pauses on hover / focus / hidden tab,
 * static under prefers-reduced-motion.
 */
export function PromotionCard({ slot }: Props) {
  const views = useMemo(() => toViews(slot), [slot])
  const intervalMs = clampRotationInterval(slot.slot?.rotation_interval_ms)
  const [state, dispatch] = useReducer(rotationReducer, views.length, (count) =>
    initialRotationState(count)
  )
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    dispatch({ type: "count", count: views.length })
  }, [views.length])

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    dispatch({ type: "reduced_motion", value: mq.matches })
    const onChange = (e: MediaQueryListEvent) =>
      dispatch({ type: "reduced_motion", value: e.matches })
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    const onVisibility = () =>
      dispatch({ type: "visibility", hidden: document.visibilityState === "hidden" })
    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  const running = isRotationRunning(state)
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => dispatch({ type: "tick" }), intervalMs)
    return () => window.clearInterval(t)
  }, [running, intervalMs, state.index])

  const onFocus = useCallback(() => dispatch({ type: "focus", value: true }), [])
  const onBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (rootRef.current && e.relatedTarget && rootRef.current.contains(e.relatedTarget as Node)) {
      return
    }
    dispatch({ type: "focus", value: false })
  }, [])

  if (views.length === 0) return null
  const active = views[Math.min(state.index, views.length - 1)]!
  const multi = views.length > 1
  const label = (slot.slot?.label ?? "").trim() || promotionCopy.defaultLabel

  return (
    <div
      ref={rootRef}
      className="card product-card promotion-card"
      data-promotion-card=""
      data-promotion-active={active.id}
      data-promotion-count={views.length}
      data-promotion-running={running ? "true" : "false"}
      onMouseEnter={() => dispatch({ type: "hover", value: true })}
      onMouseLeave={() => dispatch({ type: "hover", value: false })}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="product-card-media-switcher promotion-card-media">
        <Link
          href={active.href}
          className="product-card-media-link card-link promotion-card-media-link"
          aria-label={`${active.title} - ${label}`}
        >
          <span className="promotion-card-eyebrow" aria-hidden="true">
            {label}
          </span>
          <span className="promotion-card-stage">
            {views.map((view, i) => (
              <img
                key={view.id}
                src={view.imageSrc ?? undefined}
                alt=""
                className={`card-img promotion-card-img${i === state.index ? " is-active" : ""}`}
                /* Lazy for every frame: below 1500px the whole rail is
                   display:none, so nothing is fetched there; at wide
                   viewports the above-fold frame still loads immediately. */
                loading="lazy"
                aria-hidden={i !== state.index}
                draggable={false}
              />
            ))}
          </span>
        </Link>
        <div className="product-card-rails promotion-card-rails">
          {multi && (
            /* Same thumb-rail language as neighbouring cards: one thumb per
               rotating product, quiet frame on the active one. */
            <div
              className="product-card-media-thumbs-carousel promotion-card-thumbs"
              role="group"
              aria-label={promotionCopy.thumbsLabel}
            >
              <div className="product-card-media-thumbs-track">
                {views.map((view, i) => (
                  <button
                    key={view.id}
                    type="button"
                    className={`product-card-media-thumb promotion-card-thumb${
                      i === state.index ? " is-active" : ""
                    }`}
                    aria-label={`${i + 1} из ${views.length}: ${view.title}`}
                    aria-pressed={i === state.index}
                    onClick={() => dispatch({ type: "select", index: i })}
                  >
                    <img
                      src={view.imageSrc ?? undefined}
                      alt=""
                      className="product-card-media-thumb-img"
                      loading="lazy"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        <Link href={active.href} className="card-link">
          <div className="card-text-stack">
            <div className="card-context-row">
              <span className="card-context">
                {active.context ?? formatRuInline(promotionCopy.contextFallback)}
              </span>
              {active.percent > 0 && (
                <span className="variant-hint promotion-card-percent">−{active.percent}%</span>
              )}
            </div>
            <h3>{active.title}</h3>
            <div className="card-price-row">
              <p className="price promotion-card-price">
                <span className="promotion-card-price-now">
                  {active.priceFrom ? "от " : ""}
                  {formatRub(active.salePrice)}
                </span>
                <span className="promotion-card-price-was">
                  <span className="sr-only">{promotionCopy.wasPriceSr} </span>
                  <s>{formatRub(active.originalPrice)}</s>
                </span>
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
