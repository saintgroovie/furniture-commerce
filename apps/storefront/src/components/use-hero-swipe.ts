"use client"

import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react"
import { useCallback, useRef } from "react"

const SWIPE_THRESHOLD_PX = 44

/**
 * Horizontal touch swipe on the PDP hero image: previous / next photo.
 * Pair with `touch-action: pan-y` on the hero container so vertical page
 * scroll stays native while horizontal swipes reach the handlers. A swipe
 * also swallows the follow-up click so it does not open the lightbox.
 */
export function useHeroSwipe(
  enabled: boolean,
  goPrev: () => void,
  goNext: () => void
) {
  const startRef = useRef<{ x: number; y: number; id: number } | null>(null)
  const swipedRef = useRef(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      swipedRef.current = false
      if (!enabled || e.pointerType !== "touch") return
      startRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    },
    [enabled]
  )

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const start = startRef.current
      startRef.current = null
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
        swipedRef.current = true
        if (dx < 0) goNext()
        else goPrev()
      }
    },
    [goNext, goPrev]
  )

  const onPointerCancel = useCallback(() => {
    startRef.current = null
  }, [])

  const onClickCapture = useCallback((e: MouseEvent<HTMLElement>) => {
    if (!swipedRef.current) return
    swipedRef.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return { onPointerDown, onPointerUp, onPointerCancel, onClickCapture }
}
