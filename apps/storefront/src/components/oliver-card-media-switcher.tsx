"use client"

import { ProductCardMediaGalleryCore } from "@/components/product-card-media-gallery-core"
import type { CardColorVariant, CardModelVariant } from "@/lib/card-color-media"

type Props = {
  mainSrc: string
  extraSrcs: string[]
  headboardVariants?: CardModelVariant[]
  upholsteryVariants?: CardColorVariant[]
  woodVariants?: CardColorVariant[]
  finishVariants?: CardColorVariant[]
  finishLabel?: "Цвет" | "Отделка"
  href: string
  title: string
}

/**
 * Oliver catalog card: same hero contract as {@link OliverCardMedia} (`mainSrc` only),
 * optional execution selectors + gallery strip when media is available.
 */
export function OliverCardMediaSwitcher({
  mainSrc,
  extraSrcs,
  headboardVariants,
  upholsteryVariants,
  woodVariants,
  finishVariants,
  finishLabel,
  href,
  title,
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
      href={href}
      alt={title}
      oliverMode={true}
    />
  )
}
