"use client"

import { usePdpExecutionSelection } from "@/lib/cart/pdp-selection"
import { jsonLdHtml } from "@/lib/product-json-ld"
import { selectedUpholsteryJsonLd, type UpholsteryJsonLdOption } from "@/lib/product-upholstery-json-ld"

/** Uses the same confirmed selection as the buy panel and cart. */
export function PdpUpholsteryJsonLd(props: {
  jsonLd: Record<string, unknown>
  productKey: string
  options: UpholsteryJsonLdOption[]
  nonce?: string
}) {
  const selection = usePdpExecutionSelection()
  const value = selectedUpholsteryJsonLd({ ...props, selection })
  return value ? <script data-pdp-product-jsonld="" type="application/ld+json" nonce={props.nonce}
    dangerouslySetInnerHTML={{ __html: jsonLdHtml(value) }} /> : null
}
