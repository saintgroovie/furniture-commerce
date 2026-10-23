"use client"

import Link from "next/link"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import type { EditorialProduct, EditorialScene } from "@/lib/editorial-scenes"

export function EditorialArrow() {
  return <img src="/images/footer/arrow-right.svg" width={19} height={19} alt="" aria-hidden="true" className="wr-editorial-arrow" />
}

export function EditorialShoppableImage({
  scene, products, className = "", priority = false,
}: {
  scene: EditorialScene
  products: Record<string, EditorialProduct>
  className?: string
  priority?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  const skipFocus = useRef(false)
  const id = useId()
  const [size, setSize] = useState<[number, number] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [cardHeight, setCardHeight] = useState(160)

  useLayoutEffect(() => {
    if (open && popover.current) setCardHeight(popover.current.offsetHeight)
  }, [open, size])

  useEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize([entry.contentRect.width, entry.contentRect.height])
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(null); setPinned(null)
      }
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])

  function close(handle: string, restoreFocus: boolean) {
    setOpen(null); setPinned(null)
    if (restoreFocus) {
      const trigger = triggers.current.get(handle)
      if (trigger && document.activeElement !== trigger) {
        skipFocus.current = true
        trigger.focus()
      }
    }
  }

  const [width, height] = size ?? [scene.width, scene.height]
  const scale = Math.max(width / scene.width, height / scene.height)
  const photoWidth = scene.width * scale, photoHeight = scene.height * scale
  const [positionX, positionY] = scene.position ?? [0.5, 0.5]

  return (
    <div ref={root} className={`wr-shop-image ${className}`} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault(); event.stopPropagation(); close(open, true)
      }
    }}>
      <div className="wr-shop-photo-frame">
        <img src={scene.src} alt={scene.alt} width={scene.width} height={scene.height}
          loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"}
          decoding="async" draggable={false} className="wr-shop-photo"
          style={{ objectPosition: `${positionX * 100}% ${positionY * 100}%` }} />
      </div>
      {size && scene.spots.map((spot) => {
        const product = products[spot.handle]
        if (!product) return null
        const x = (spot.x / 100 * photoWidth - (photoWidth - width) * positionX) / width * 100
        const y = (spot.y / 100 * photoHeight - (photoHeight - height) * positionY) / height * 100
        if (x < 4 || x > 96 || y < 4 || y > 96) return null
        const hitWidth = Math.min(spot.width / 100 * photoWidth, width * 0.94)
        const hitHeight = Math.min(spot.height / 100 * photoHeight, height * 0.94)
        const cardWidth = Math.min(240, width - 24)
        const offset = Math.max(12, Math.min(x / 100 * width - cardWidth / 2, width - cardWidth - 12)) - x / 100 * width
        const expanded = open === spot.handle
        const anchorY = y / 100 * height
        const preferredTop = y > 50 ? anchorY - cardHeight - 24 : anchorY + 24
        const cardTop = Math.max(8, Math.min(preferredTop, height - cardHeight - 8))
        const cardId = `${id}-${spot.handle}`
        const style = {
          left: `${x}%`, top: `${y}%`, width: hitWidth, height: hitHeight,
          "--shop-card-width": `${cardWidth}px`, "--shop-card-offset": `${offset}px`,
        } as CSSProperties
        return (
          <div className={`wr-shop-region${expanded ? " is-open" : ""}`} style={style} key={spot.handle}
            onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpen(spot.handle) }}
            onPointerLeave={() => { if (pinned !== spot.handle) setOpen(null) }}
            onFocusCapture={() => {
              if (skipFocus.current) { skipFocus.current = false; return }
              setOpen(spot.handle)
            }}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(null); setPinned(null) }
            }}>
            <button type="button" className="wr-shop-hit" aria-label={`Показать товар: ${product.title}`}
              aria-expanded={expanded} aria-controls={expanded ? cardId : undefined}
              ref={(node) => { if (node) triggers.current.set(spot.handle, node); else triggers.current.delete(spot.handle) }}
              onClick={() => {
                const next = pinned === spot.handle ? null : spot.handle
                setPinned(next); setOpen(next)
              }}><span className="wr-shop-dot" aria-hidden="true" /></button>
            {expanded && (
              <div className="wr-shop-popover" id={cardId} ref={popover} style={{ top: cardTop - (anchorY - hitHeight / 2) }}>
                <div className="wr-shop-card">
                  <button type="button" className="wr-shop-close" aria-label={`Закрыть карточку: ${product.title}`} onClick={() => close(spot.handle, true)}>Закрыть</button>
                  <strong>{product.title}</strong>
                  {product.priceLabel && <span className="wr-shop-price">{product.priceLabel}</span>}
                  <Link className="wr-shop-buy" href={product.href} aria-label={`${product.actionLabel}: ${product.title}`}>{product.actionLabel}<EditorialArrow /></Link>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
