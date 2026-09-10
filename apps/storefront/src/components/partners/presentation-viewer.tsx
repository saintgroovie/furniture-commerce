"use client"

import { useEffect, useState } from "react"
import type { EditorialSlide } from "@/lib/api/partners"
import { formatRuInline } from "@/lib/format-ru-copy"
import { partnersCopy } from "@/lib/woodright-copy"

type Props = {
  src: string
  title: string
  mime: string | null
  slides?: EditorialSlide[]
}

export function PresentationViewer({ src, title, mime: _mime, slides }: Props) {
  if (slides && slides.length > 0) {
    return <EditorialDeck title={title} slides={slides} />
  }

  if (!src) return null

  return (
    <div className="ed-viewer-frame">
      <div className="ed-viewer-actions">
        <a
          href={src}
          className="btn btn-primary"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${partnersCopy.openFile}: ${title}`}
        >
          {partnersCopy.openFile}
        </a>
        <a href={src} className="btn btn-secondary" download>
          {partnersCopy.downloadFile}
        </a>
      </div>
    </div>
  )
}

function EditorialDeck({ title, slides }: { title: string; slides: EditorialSlide[] }) {
  const [index, setIndex] = useState(0)
  const last = Math.max(0, slides.length - 1)
  const slide = slides[index] ?? slides[0]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setIndex((current) => Math.min(last, current + 1))
      }
      if (event.key === "ArrowLeft") {
        setIndex((current) => Math.max(0, current - 1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [last])

  if (!slide) return null

  const go = (next: number) => {
    setIndex(Math.min(last, Math.max(0, next)))
  }

  return (
    <div className="ed-deck" aria-label={title}>
      <figure className="ed-deck-stage">
        <img key={slide.src} src={slide.src} alt={slide.alt} />
        <figcaption>
          <p className="ed-deck-kicker">
            {index + 1} / {slides.length}
          </p>
          <h2>{formatRuInline(slide.title)}</h2>
          <p>{formatRuInline(slide.caption)}</p>
        </figcaption>
      </figure>
      <div className="ed-deck-nav">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => go(index - 1)}
          disabled={index === 0}
        >
          {partnersCopy.prevSlide}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => go(index + 1)}
          disabled={index === last}
        >
          {partnersCopy.nextSlide}
        </button>
      </div>
    </div>
  )
}
