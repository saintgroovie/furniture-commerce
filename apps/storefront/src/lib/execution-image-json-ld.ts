import type { PdpExecutionSelection } from "./cart/pdp-selection"
import { resolvePdpMediaSrc } from "./product-images"

/** Gallery/CTA bridge owns the confirmed hero; never reuse another execution's pictures. */
export function selectedExecutionImageJsonLd(input: {
  jsonLd: Record<string, unknown>
  productKey: string
  selection: PdpExecutionSelection | null
}): Record<string, unknown> | null {
  const { jsonLd, selection } = input
  if (!selection || selection.gate.productKey !== input.productKey) return jsonLd
  if (!selection.gate.complete || !selection.gate.combinationAvailable) return null
  if (jsonLd["@type"] !== "Product") return jsonLd
  const source = selection.imageSrc || selection.gate.imageSrc
  if (!source) return jsonLd
  try {
    const image = new URL(resolvePdpMediaSrc(source), String(jsonLd.url))
    if (!/^https?:$/.test(image.protocol)) return null
    return { ...jsonLd, image: [image.href] }
  } catch { return null }
}
