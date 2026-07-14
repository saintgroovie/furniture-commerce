"use client"

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { pdpLightboxCopy as copy } from "@/lib/woodright-copy"

type Props = {
  images: string[]
  activeIndex: number
  alt: string
  onClose: () => void
  onNavigate: (index: number) => void
}

const ZOOM_SCALE = 2.2
const MAX_PINCH_SCALE = 3
const SWIPE_THRESHOLD_PX = 48
const TAP_SLOP_PX = 8

type PointerInfo = { x: number; y: number }

/**
 * Fullscreen photo viewer opened from the PDP hero. Shared across every PDP
 * media switcher. Keyboard: Escape close, arrows navigate. Touch: swipe to
 * navigate, pinch / double-tap to zoom, drag to pan. Mouse: click to zoom at
 * point, drag to pan, controls for everything. Focus is trapped inside the
 * dialog and returned to the opener on close.
 */
export function PdpImageLightbox({
  images,
  activeIndex,
  alt,
  onClose,
  onNavigate,
}: Props) {
  const count = images.length
  const src = images[activeIndex]
  /* Guards effects when called with an empty list or out-of-range index:
     nothing renders, so nothing may lock scroll or steal focus either. */
  const hasImage = typeof src === "string" && src.length > 0

  const dialogRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const thumbsRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [imageReady, setImageReady] = useState(false)

  /* Gesture bookkeeping lives in refs — pointer events fire too often for state. */
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map())
  const gestureRef = useRef<{
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
    moved: boolean
    didPinch: boolean
    pinchStartDist: number | null
    pinchStartZoom: number
    lastTapAt: number
    lastTapX: number
    lastTapY: number
  }>({
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    moved: false,
    didPinch: false,
    pinchStartDist: null,
    pinchStartZoom: 1,
    lastTapAt: 0,
    lastTapX: 0,
    lastTapY: 0,
  })

  const zoomed = zoom > 1.01

  const resetZoom = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const goTo = useCallback(
    (index: number) => {
      if (count < 2) return
      resetZoom()
      setImageReady(false)
      onNavigate(((index % count) + count) % count)
    },
    [count, onNavigate, resetZoom]
  )

  const goPrev = useCallback(() => goTo(activeIndex - 1), [goTo, activeIndex])
  const goNext = useCallback(() => goTo(activeIndex + 1), [goTo, activeIndex])

  /** Zoom in keeping the given stage-relative point (px from center) still. */
  const zoomAtPoint = useCallback((dx: number, dy: number) => {
    setZoom(ZOOM_SCALE)
    setOffset({
      x: -dx * (ZOOM_SCALE - 1),
      y: -dy * (ZOOM_SCALE - 1),
    })
  }, [])

  const toggleZoom = useCallback(
    (clientX?: number, clientY?: number) => {
      if (zoomed) {
        resetZoom()
        return
      }
      const stage = stageRef.current
      if (stage && clientX != null && clientY != null) {
        const rect = stage.getBoundingClientRect()
        zoomAtPoint(
          clientX - rect.left - rect.width / 2,
          clientY - rect.top - rect.height / 2
        )
      } else {
        setZoom(ZOOM_SCALE)
      }
    },
    [zoomed, resetZoom, zoomAtPoint]
  )

  const clampOffset = useCallback(
    (x: number, y: number, scale: number) => {
      const stage = stageRef.current
      if (!stage) return { x, y }
      const maxX = (stage.clientWidth * (scale - 1)) / 2
      const maxY = (stage.clientHeight * (scale - 1)) / 2
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      }
    },
    []
  )

  /* --- Keyboard, scroll lock, focus trap, focus restore --- */
  useEffect(() => {
    if (!hasImage) return
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.focus()

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = prevOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [hasImage])

  useEffect(() => {
    if (!hasImage) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        goPrev()
        return
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === "Tab") {
        const dialog = dialogRef.current
        if (!dialog) return
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null)
        if (focusables.length === 0) {
          e.preventDefault()
          dialog.focus()
          return
        }
        const first = focusables[0]!
        const last = focusables[focusables.length - 1]!
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === dialog)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [hasImage, onClose, goPrev, goNext])

  /* --- Preload neighbours so next/prev feels instant --- */
  useEffect(() => {
    if (count < 2) return
    const preload = (i: number) => {
      const url = images[((i % count) + count) % count]
      if (!url) return
      const img = new Image()
      img.src = url
    }
    preload(activeIndex + 1)
    preload(activeIndex - 1)
  }, [images, activeIndex, count])

  /* --- Keep the active thumb visible --- */
  useEffect(() => {
    const track = thumbsRef.current
    if (!track) return
    const active = track.querySelector<HTMLElement>('[aria-current="true"]')
    active?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [activeIndex])

  /* --- Pointer gestures: swipe / pan / pinch / double-tap --- */
  const onStagePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const g = gestureRef.current
      if (pointers.size === 1) {
        g.startX = e.clientX
        g.startY = e.clientY
        g.startOffsetX = offset.x
        g.startOffsetY = offset.y
        g.moved = false
        g.didPinch = false
        setDragging(true)
      } else if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values())
        g.pinchStartDist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
        g.pinchStartZoom = zoom
        g.didPinch = true
      }
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      } catch {
        /* pointer may already be gone (fast tap / synthetic event) */
      }
    },
    [offset.x, offset.y, zoom]
  )

  const onStagePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const g = gestureRef.current

      if (pointers.size === 2 && g.pinchStartDist != null) {
        const [a, b] = Array.from(pointers.values())
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
        const nextZoom = Math.min(
          MAX_PINCH_SCALE,
          Math.max(1, (g.pinchStartZoom * dist) / g.pinchStartDist)
        )
        setZoom(nextZoom)
        if (nextZoom <= 1.01) setOffset({ x: 0, y: 0 })
        else setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom))
        return
      }

      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) g.moved = true
      if (zoomed) {
        setOffset(
          clampOffset(g.startOffsetX + dx, g.startOffsetY + dy, zoom)
        )
      }
    },
    [zoomed, zoom, clampOffset]
  )

  const onStagePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current
      const g = gestureRef.current
      pointers.delete(e.pointerId)
      if (pointers.size < 2) g.pinchStartDist = null
      if (pointers.size > 0) return
      setDragging(false)

      /* A finished pinch must not be re-read as a tap or swipe from the
         first pointer's original coordinates. */
      if (g.didPinch) {
        g.didPinch = false
        g.moved = false
        return
      }

      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      /* pointermove can be coalesced away on fast flicks — re-check on release. */
      if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) g.moved = true

      if (!g.moved) {
        /* Tap / click. Double-tap (touch) or click (mouse) toggles zoom. */
        const now = Date.now()
        const isDoubleTap =
          now - g.lastTapAt < 320 &&
          Math.abs(e.clientX - g.lastTapX) < 24 &&
          Math.abs(e.clientY - g.lastTapY) < 24
        g.lastTapAt = now
        g.lastTapX = e.clientX
        g.lastTapY = e.clientY
        if (e.pointerType === "mouse" || isDoubleTap) {
          toggleZoom(e.clientX, e.clientY)
        }
        return
      }

      /* Swipe navigation only when not zoomed (when zoomed, drag = pan). */
      if (!zoomed && Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) goNext()
        else goPrev()
      }
    },
    [zoomed, goNext, goPrev, toggleZoom]
  )

  const onStagePointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId)
    gestureRef.current.pinchStartDist = null
    if (pointersRef.current.size === 0) setDragging(false)
  }, [])

  const imageStyle = useMemo<CSSProperties>(
    () => ({
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
      transition: dragging ? "none" : undefined,
    }),
    [offset.x, offset.y, zoom, dragging]
  )

  if (!hasImage) return null

  const dialog = (
    <div
      ref={dialogRef}
      className="pdp-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} - ${copy.dialogSuffix}`}
      tabIndex={-1}
    >
      <div className="pdp-lightbox-backdrop" onClick={onClose} aria-hidden="true" />

      <div className="pdp-lightbox-topbar">
        {count > 1 && (
          <span className="pdp-lightbox-counter">
            {activeIndex + 1} / {count}
          </span>
        )}
        <button
          type="button"
          className="pdp-lightbox-control pdp-lightbox-zoom"
          aria-label={zoomed ? copy.zoomOut : copy.zoomIn}
          aria-pressed={zoomed}
          onClick={() => toggleZoom()}
        >
          {zoomed ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="pdp-lightbox-control pdp-lightbox-close"
          aria-label={copy.close}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {count > 1 && (
        <button
          type="button"
          className="pdp-lightbox-control pdp-lightbox-nav pdp-lightbox-nav--prev"
          aria-label={copy.prev}
          onClick={goPrev}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="14.5,5.5 8,12 14.5,18.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div
        ref={stageRef}
        className={`pdp-lightbox-stage${zoomed ? " is-zoomed" : ""}${dragging ? " is-dragging" : ""}`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerCancel}
      >
        <img
          key={src}
          src={src}
          alt={alt}
          className={`pdp-lightbox-img${imageReady ? " is-ready" : ""}`}
          style={imageStyle}
          draggable={false}
          onLoad={() => setImageReady(true)}
        />
      </div>

      {count > 1 && (
        <button
          type="button"
          className="pdp-lightbox-control pdp-lightbox-nav pdp-lightbox-nav--next"
          aria-label={copy.next}
          onClick={goNext}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="9.5,5.5 16,12 9.5,18.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {count > 1 && (
        <div className="pdp-lightbox-thumbs" ref={thumbsRef} role="toolbar" aria-label={copy.thumbsLabel}>
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              className={`pdp-lightbox-thumb${i === activeIndex ? " is-active" : ""}`}
              aria-label={`${copy.dialogSuffix} ${i + 1}`}
              aria-current={i === activeIndex ? "true" : undefined}
              onClick={() => goTo(i)}
            >
              <img src={url} alt="" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return createPortal(dialog, document.body)
}
