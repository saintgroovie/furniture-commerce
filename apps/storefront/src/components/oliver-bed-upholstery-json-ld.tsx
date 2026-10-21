"use client"

import { usePdpExecutionSelection } from "@/lib/cart/pdp-selection"
import { jsonLdHtml } from "@/lib/product-json-ld"
import { selectedOliverBedUpholsteryJsonLd, type OliverUpholsteryJsonLdOption } from "@/lib/oliver-bed-upholstery-json-ld"

/** SSR default and hydrated changes use the same script, gallery selection and cart gate. */
export function OliverBedUpholsteryJsonLd(props: {
  jsonLd: Record<string, unknown>
  productKey: string
  options: OliverUpholsteryJsonLdOption[]
  nonce?: string
}) {
  const selection = usePdpExecutionSelection()
  const value = selectedOliverBedUpholsteryJsonLd({ ...props, selection })
  return value ? <script type="application/ld+json" data-oliver-bed-product-jsonld="" nonce={props.nonce}
    dangerouslySetInnerHTML={{ __html: jsonLdHtml(value) }} /> : null
}
