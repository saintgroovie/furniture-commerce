"use client"

import { usePdpExecutionSelection } from "@/lib/cart/pdp-selection"
import { selectedExecutionImageJsonLd } from "@/lib/execution-image-json-ld"
import { jsonLdHtml } from "@/lib/product-json-ld"

export function PdpExecutionImageJsonLd(props: {
  jsonLd: Record<string, unknown>
  productKey: string
  nonce?: string
}) {
  const selection = usePdpExecutionSelection()
  const value = selectedExecutionImageJsonLd({ ...props, selection })
  return value ? <script data-pdp-execution-image-jsonld="" type="application/ld+json" nonce={props.nonce}
    dangerouslySetInnerHTML={{ __html: jsonLdHtml(value) }} /> : null
}
