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
  greenwichBedMatrix?: GreenwichBedMatrixEntry[]
  title: string
  heroObjectPosition?: string
}

/** Greenwich bed PDP: headboard + wood + fabric matrix with scoped gallery. */
export function GreenwichBedPdpMediaSwitcher({
  mainSrc,
  extraSrcs,
  headboardVariants,
  upholsteryVariants,
  woodVariants,
  greenwichBedMatrix,
  title,
  heroObjectPosition,
}: Props) {
  return (
    <ProductCardMediaGalleryCore
      mainSrc={mainSrc}
      extraSrcs={extraSrcs}
      headboardVariants={headboardVariants}
      upholsteryVariants={upholsteryVariants}
      woodVariants={woodVariants}
      greenwichBedMatrix={greenwichBedMatrix}
      href="#"
      alt={title}
      layout="pdp"
      heroObjectPosition={heroObjectPosition}
    />
  )
}
