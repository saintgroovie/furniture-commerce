"use client"

import { usePdpMaterialSelection } from "@/lib/cart/pdp-material-selection"
import { selectedOliverFacadeJsonLd } from "@/lib/selected-oliver-facade-json-ld"
import { jsonLdHtml } from "@/lib/json-ld"

export function PdpOliverFacadeJsonLd(props: {
  jsonLd: Record<string, unknown>; variantId: string; productKey: string; initialMaterialCode: string; nonce?: string
}) {
  const selection = usePdpMaterialSelection()
  const materialCode = selection?.productKey === props.productKey ? selection.code : props.initialMaterialCode
  const value = selectedOliverFacadeJsonLd(props.jsonLd, props.variantId, materialCode)
  return value ? <script type="application/ld+json" data-pdp-facade-jsonld="" nonce={props.nonce}
    dangerouslySetInnerHTML={{ __html: jsonLdHtml(value) }} /> : null
}
