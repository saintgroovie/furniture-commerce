"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { EditorialSlide } from "@/lib/api/partners"
import { formatRuInline } from "@/lib/format-ru-copy"
import { isPartnerPdf } from "@/lib/partner-file"
import { partnersCopy } from "@/lib/woodright-copy"

type Props = {
  title: string
  kicker?: string
  slides: EditorialSlide[]
  fileUrl?: string
  mime?: string | null
  initialIndex?: number
  onClose?: () => void
  backHref?: string
  backLabel?: string
}

export function DeckViewer({
  title,
  kicker,
  slides,
  fileUrl,
  mime,
  initialIndex = 0,
  onClose,
  backHref,
  backLabel,
}: Props) {
  const last = Math.max(0, slides.length - 1)
  const [index, setIndex] = useState(() => Math.min(last, Math.max(0, initialIndex)))
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backRef = useRef<HTMLAnchorElement>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const slide = slides[index] ?? slides[0]
  const downloadable = isPartnerPdf(fileUrl, mime)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const inerted: HTMLElement[] = []
    let node: HTMLElement | null = dialogRef.current
    while (node && node.parentElement && node !== document.body) {
      const parent = node.parentElement
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node || !(sibling instanceof HTMLElement) || sibling.hasAttribute("inert")) continue
        sibling.setAttribute("inert", "")
        inerted.push(sibling)
      }
      node = parent
    }
    ;(closeRef.current ?? backRef.current)?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault()
        setIndex((current) => Math.min(last, current + 1))
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        setIndex((current) => Math.max(0, current - 1))
      } else if (event.key === "Escape") {
        event.preventDefault()
        if (onClose) {
          if (window.history.state?.pxDeck) window.history.back()
          else onClose()
        } else backRef.current?.click()
      } else if (event.key === "Tab" && dialogRef.current) {
        const items = [...dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")]
        if (items.length === 0) return
        const first = items[0]
        const lastItem = items[items.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
          event.preventDefault()
          lastItem.focus()
        } else if (!event.shiftKey && active === lastItem) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      for (const node of inerted) node.removeAttribute("inert")
      window.removeEventListener("keydown", onKey)
      const back = document.querySelector<HTMLElement>("[data-deck-return]")
      back?.focus()
      back?.removeAttribute("data-deck-return")
    }
  }, [last, onClose])

  useEffect(() => {
    if (!onClose) return
    const current = window.history.state as { pxDeck?: boolean; index?: number } | null
    if (!current?.pxDeck || current.index === index) return
    window.history.replaceState({ ...current, index }, "")
  }, [index, onClose])

  if (!slide) return null

  const go = (next: number) => setIndex(Math.min(last, Math.max(0, next)))

  return (
    <div
      ref={dialogRef}
      className="px-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={(event) => {
        origin.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={(event) => {
        const start = origin.current
        origin.current = null
        if (!start) return
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
        go(index + (dx < 0 ? 1 : -1))
      }}
    >
      <header className="px-viewer-bar">
        <p className="px-viewer-kicker">
          {backHref ? (
            <Link ref={backRef} href={backHref}>
              {formatRuInline(backLabel || partnersCopy.backToIndex)}
            </Link>
          ) : (
            <span>{formatRuInline(kicker || "")}</span>
          )}
        </p>
        <p className="px-viewer-count" aria-live="polite">
          {index + 1} / {slides.length}
        </p>
        {onClose ? (
          <button
            ref={closeRef}
            type="button"
            className="px-viewer-close"
            onClick={() => {
              if (window.history.state?.pxDeck) window.history.back()
              else onClose()
            }}
          >
            {partnersCopy.closeViewer}
          </button>
        ) : (
          <Link className="px-viewer-close" href={backHref || "/partners"}>
            {partnersCopy.closeViewer}
          </Link>
        )}
      </header>

      <figure className="px-viewer-stage">
        <img key={slide.src} src={slide.src} alt={slide.alt} />
        <figcaption>
          <strong>{formatRuInline(slide.title)}</strong>
          <span>{formatRuInline(slide.caption)}</span>
        </figcaption>
      </figure>

      <div className="px-viewer-nav">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>
          {partnersCopy.prevSlide}
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={index === last}>
          {partnersCopy.nextSlide}
        </button>
        {downloadable ? (
          <a href={fileUrl} download>
            {partnersCopy.downloadFile}
          </a>
        ) : null}
        {downloadable ? (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            {partnersCopy.openFile}
          </a>
        ) : null}
      </div>
    </div>
  )
}
