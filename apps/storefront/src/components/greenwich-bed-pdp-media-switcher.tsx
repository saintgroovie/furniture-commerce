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
  /** Interiors from shared_scene_media (scene_type=interior). */
  sharedInteriorSrcs?: string[]
  title: string
  heroObjectPosition?: string
  productHandle?: string
}

/** Greenwich bed PDP: headboard + wood + fabric matrix with scoped gallery. */
export function GreenwichBedPdpMediaSwitcher({
  mainSrc,
  extraSrcs,
  headboardVariants,
  upholsteryVariants,
  woodVariants,
  greenwichBedMatrix,
  sharedInteriorSrcs,
  title,
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
      greenwichBedMatrix={greenwichBedMatrix}
      sharedInteriorSrcs={sharedInteriorSrcs}
      href="#"
      alt={title}
      layout="pdp"
      heroObjectPosition={heroObjectPosition}
      productHandle={productHandle}
    />
  )
}
