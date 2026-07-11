"use client"

import { ProductCardMediaGalleryCore } from "@/components/product-card-media-gallery-core"
import type { CardColorVariant, CardModelVariant } from "@/lib/card-color-media"
import type { GreenwichBedMatrixEntry } from "@/lib/greenwich-bed-media"
import type { GreenwichPaintMatrixEntry } from "@/lib/greenwich-paint-media"

type Props = {
  mainSrc: string
  extraSrcs: string[]
  headboardVariants?: CardModelVariant[]
  upholsteryVariants?: CardColorVariant[]
  woodVariants?: CardColorVariant[]
  finishVariants?: CardColorVariant[]
  finishLabel?: "Цвет" | "Отделка" | "Материал" | "Конструкция"
  greenwichBedMatrix?: GreenwichBedMatrixEntry[]
  greenwichPaintMatrix?: GreenwichPaintMatrixEntry[]
  href: string
  alt: string
}

export function ProductCardMediaSwitcher({
  mainSrc,
  extraSrcs,
  headboardVariants,
  upholsteryVariants,
  woodVariants,
  finishVariants,
  finishLabel,
  greenwichBedMatrix,
  greenwichPaintMatrix,
  href,
  alt,
}: Props) {
  return (
    <ProductCardMediaGalleryCore
      mainSrc={mainSrc}
      extraSrcs={extraSrcs}
      headboardVariants={headboardVariants}
      upholsteryVariants={upholsteryVariants}
      woodVariants={woodVariants}
      finishVariants={finishVariants}
      finishLabel={finishLabel}
      greenwichBedMatrix={greenwichBedMatrix}
      greenwichPaintMatrix={greenwichPaintMatrix}
      href={href}
      alt={alt}
    />
  )
}
