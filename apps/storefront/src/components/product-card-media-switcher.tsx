"use client"

import Link from "next/link"
import type { MouseEvent } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useVerifiedStripExtras } from "@/components/use-verified-strip-extras"

type Props = {
  mainSrc: string
  extraSrcs: string[]
  href: string
  alt: string
}

export function ProductCardMediaSwitcher({ mainSrc, extraSrcs, href, alt }: Props) {
  const mainTrimmed = mainSrc.trim()
  const [displayHeroSrc, setDisplayHeroSrc] = useState(mainTrimmed)
  const [activeExtraUrl, setActiveExtraUrl] = useState<string | null>(null)
  const [failedExtras, setFailedExtras] = useState<Set<string>>(() => new Set())
  const [pendingPreloadUrl, setPendingPreloadUrl] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)

  useEffect(() => {
    setDisplayHeroSrc(mainTrimmed)
    setActiveExtraUrl(null)
    setFailedExtras(new Set())
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [mainTrimmed])

  const visibleStrip = useVerifiedStripExtras(extraSrcs, failedExtras)

  const showThumbRow = visibleStrip.length > 0

  const onHeroError = useCallback(() => {
    setDisplayHeroSrc(mainTrimmed)
    setActiveExtraUrl(null)
  }, [mainTrimmed])

  const onThumbPick = useCallback(
    (url: string) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (url === displayHeroSrc && activeExtraUrl === url) return
      if (pendingRef.current === url) return
      pendingRef.current = url
      setPendingPreloadUrl(url)
    },
    [displayHeroSrc, activeExtraUrl]
  )

  const onPreloadLoad = useCallback(() => {
    const u = pendingRef.current
    if (!u) return
    setDisplayHeroSrc(u)
    setActiveExtraUrl(u)
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [])

  const onPreloadError = useCallback(() => {
    const u = pendingRef.current
    if (!u) return
    setFailedExtras((prev) => new Set(prev).add(u))
    pendingRef.current = null
    setPendingPreloadUrl(null)
  }, [])

  const heroIsPlaceholder = !displayHeroSrc

  return (
    <div className="product-card-media-switcher">
      <Link href={href} className="product-card-media-link card-link" aria-label={alt}>
        {heroIsPlaceholder ? (
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
      {showThumbRow && (
        <div
          className="product-card-media-thumbs"
          role="toolbar"
          aria-label="Дополнительные фото"
          onClick={(e) => e.stopPropagation()}
        >
          {visibleStrip.map((url) => {
            const isActive = activeExtraUrl === url
            const isBusy = pendingPreloadUrl === url
            return (
              <button
                key={url}
                type="button"
                className={`product-card-media-thumb${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                aria-busy={isBusy}
                disabled={isBusy}
                onClick={onThumbPick(url)}
                title="Показать фото"
              >
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className="product-card-media-thumb-img"
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
