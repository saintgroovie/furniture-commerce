"use client"

import { usePdpExecutionSelection } from "@/lib/cart/pdp-selection"
import { selectedGreenwichBedJsonLd, type GreenwichBedJsonLdContext } from "@/lib/greenwich-bed-json-ld"
import { jsonLdHtml } from "@/lib/product-json-ld"

export function PdpGreenwichBedJsonLd({ context, nonce }: { context: GreenwichBedJsonLdContext; nonce?: string }) {
  const selection = usePdpExecutionSelection()
  const value = selectedGreenwichBedJsonLd(context, selection)
  return value ? <script data-pdp-greenwich-bed-jsonld="" type="application/ld+json" nonce={nonce}
    dangerouslySetInnerHTML={{ __html: jsonLdHtml(value) }} /> : null
}
