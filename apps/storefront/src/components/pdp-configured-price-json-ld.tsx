"use client"

import { usePdpExecutionSelection } from "@/lib/cart/pdp-selection"
import { usePdpMaterialSelection } from "@/lib/cart/pdp-material-selection"
import { jsonLdHtml } from "@/lib/product-json-ld"
import { selectedConfiguredPriceJsonLd, type ConfiguredPriceJsonLdContext } from "@/lib/configured-price-json-ld"

/** The current purchase selection drives this single Product script. */
export function PdpConfiguredPriceJsonLd(props: {
  jsonLd: Record<string, unknown>
  context: ConfiguredPriceJsonLdContext
  nonce?: string
}) {
  const selection = usePdpExecutionSelection()
  const materialSelection = usePdpMaterialSelection()
  const value = selectedConfiguredPriceJsonLd({ ...props, selection, materialSelection })
  return value ? <script data-pdp-configured-price-jsonld="" type="application/ld+json" nonce={props.nonce}
    dangerouslySetInnerHTML={{ __html: jsonLdHtml(value) }} /> : null
}
