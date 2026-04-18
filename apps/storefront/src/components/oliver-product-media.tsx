"use client"

import { useState } from "react"

/**
 * Oliver-only: avoid misleading placeholder / skeleton when there is no usable image
 * or when the image URL fails at runtime. Non-Oliver cards keep existing behavior.
 */
export function OliverCardMedia({ src, title }: { src?: string | null; title: string }) {
  const [failed, setFailed] = useState(false)
  if (!src?.trim() || failed) {
    return (
      <div className="card-img oliver-media-absent" aria-label="Нет изображения">
        <span className="oliver-media-absent-label">Нет фото</span>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={title}
      className="card-img"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function OliverHeroMedia({
  src,
  title,
  className,
}: {
  src?: string | null
  title: string
  className: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src?.trim() || failed) {
    return (
      <div className={`${className} oliver-media-absent`} aria-label="Нет изображения">
        <span className="oliver-media-absent-label">Нет фото</span>
      </div>
    )
  }
  return <img src={src} alt={title} className={className} onError={() => setFailed(true)} />
}
