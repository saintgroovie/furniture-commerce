"use client"

import { ProductCardMediaGalleryCore } from "@/components/product-card-media-gallery-core"
import type { CardColorVariant, CardModelVariant } from "@/lib/card-color-media"
import type { GreenwichBedMatrixEntry } from "@/lib/greenwich-bed-media"

type Props = {
  mainSrc: string
  extraSrcs: string[]
  headboardVariants?: CardModelVariant[]
  upholsteryVariants?: CardColorVariant[]
  woodVariants?: CardColorVariant[]
  finishVariants?: CardColorVariant[]
  finishLabel?: "Цвет" | "Отделка" | "Материал" | "Конструкция"
  greenwichBedMatrix?: GreenwichBedMatrixEntry[]
  title: string
  oliverMode?: boolean
  heroObjectPosition?: string
}

/** PDP with execution swatches — same gallery core as catalog cards. */
export function ProductPdpExecutionMediaSwitcher({
  mainSrc,
  extraSrcs,
  headboardVariants,
  upholsteryVariants,
  woodVariants,
  finishVariants,
  finishLabel,
  greenwichBedMatrix,
  title,
  oliverMode = false,
  heroObjectPosition,
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
      href="#"
      alt={title}
      layout="pdp"
      oliverMode={oliverMode}
      heroObjectPosition={heroObjectPosition}
    />
  )
}
