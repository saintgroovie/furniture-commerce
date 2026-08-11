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
  separateFabricRows?: CardColorVariant[]
  greenwichBedMatrix?: GreenwichBedMatrixEntry[]
  greenwichPaintMatrix?: GreenwichPaintMatrixEntry[]
  title: string
  oliverMode?: boolean
  heroObjectPosition?: string
  productHandle?: string
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
  separateFabricRows,
  greenwichBedMatrix,
  greenwichPaintMatrix,
  title,
  oliverMode = false,
  heroObjectPosition,
  productHandle,
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
      separateFabricRows={separateFabricRows}
      greenwichBedMatrix={greenwichBedMatrix}
      greenwichPaintMatrix={greenwichPaintMatrix}
      href="#"
      alt={title}
      layout="pdp"
      oliverMode={oliverMode}
      heroObjectPosition={heroObjectPosition}
      productHandle={productHandle}
    />
  )
}
