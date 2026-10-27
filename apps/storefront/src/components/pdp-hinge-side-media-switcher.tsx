"use client"

import {OliverPdpMediaSwitcher} from "@/components/oliver-pdp-media-switcher"
import {hingeSideForProduct, usePdpHingeSideSelection} from "@/lib/cart/pdp-hinge-side"
import {resolveHingeSideMedia, type HingeSideMedia} from "@/lib/pdp-hinge-side-media"

type Props = {productKey:string; title:string; media:HingeSideMedia}

/** Observe the same selection as ProductCta; never publish a default choice. */
export function PdpHingeSideMediaSwitcher({productKey,title,media}:Props) {
  const selection=usePdpHingeSideSelection()
  const side=hingeSideForProduct(selection,productKey)
  const photos=resolveHingeSideMedia(media,side)
  if (!photos.mainSrc) return <div className="product-detail-img oliver-media-absent" role="status">
    <span className="oliver-media-absent-label">Фотография с ручкой {side==="right"?"справа":"слева"} уточняется</span>
  </div>
  const captions=Object.fromEntries([
    ...media.left.map((url)=>[url,"Ручка слева"]),
    ...media.right.map((url)=>[url,"Ручка справа"]),
  ])
  return <OliverPdpMediaSwitcher key={`${productKey}:${side??"unselected"}`}
    mainSrc={photos.mainSrc} extraSrcs={photos.extraSrcs} title={title} captions={captions}/>
}
