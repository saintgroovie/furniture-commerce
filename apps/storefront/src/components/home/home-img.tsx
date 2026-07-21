"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { catalogCardOriginalFromDerivative } from "@/lib/catalog-card-image"
import { resolveHomeImageSrc } from "./home-image"

export { resolveHomeImageSrc }

type HomeImgProps = {
  /** Original `/product-static/…` (or already-resolved) URL. */
  src: string | undefined
  alt?: string
  className?: string
  loading?: "eager" | "lazy"
  fetchPriority?: "high" | "low" | "auto"
  decoding?: "async" | "auto" | "sync"
  draggable?: boolean
  style?: CSSProperties
  "aria-hidden"?: boolean | "true" | "false"
  "data-slide"?: number | string
  "data-cycle"?: number | string
  "data-active"?: string
}

/** Homepage image: prefer catalog-card WebP when baked; fall back on error. */
export function HomeImg({
  src,
  alt = "",
  className,
  loading,
  fetchPriority,
  decoding = "async",
  draggable = false,
  style,
  "aria-hidden": ariaHidden,
  "data-slide": dataSlide,
  "data-cycle": dataCycle,
  "data-active": dataActive,
}: HomeImgProps) {
  const original = typeof src === "string" ? src.trim() : ""
  const preferred = original ? resolveHomeImageSrc(original) : ""
  const [current, setCurrent] = useState(preferred)

  useEffect(() => {
    setCurrent(preferred)
  }, [preferred])

  if (!original) {
    return (
      <img
        alt={alt}
        className={className}
        aria-hidden={ariaHidden}
        data-slide={dataSlide}
        data-cycle={dataCycle}
        data-active={dataActive}
        decoding={decoding}
        draggable={draggable}
        style={style}
      />
    )
  }

  return (
    <img
      src={current || undefined}
      alt={alt}
      className={className}
      loading={loading}
      // React DOM still uses the lowercase DOM attribute name.
      fetchPriority={fetchPriority}
      decoding={decoding}
      draggable={draggable}
      style={style}
      aria-hidden={ariaHidden}
      data-slide={dataSlide}
      data-cycle={dataCycle}
      data-active={dataActive}
      onError={() => {
        if (!current) return
        if (current !== original) {
          setCurrent(original)
          return
        }
        const recovered = catalogCardOriginalFromDerivative(current)
        if (recovered && recovered !== current) setCurrent(recovered)
      }}
    />
  )
}

// resolveHomeImageSrc re-exported above for convenience in client modules.
