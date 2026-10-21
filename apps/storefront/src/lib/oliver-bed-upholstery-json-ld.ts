import type { CardExecutionSelectors } from "./card-color-media"
import type { PdpExecutionSelection } from "./cart/pdp-selection"

export type OliverUpholsteryJsonLdOption = { key: string; label: string; images: string[] }
const IDENTITIES = {
  "ol-16-1": ["prod_01KNTBXADGPHKZEWKKT477WNR7", "OL-16-1"],
  "ol-16-2": ["prod_01KNTBXADGH3EK5BM3RAZ2Z7KT", "OL-16-2"],
} as const

/** Existing OL-16 executions only; OL-15 remains outside this contract. */
export function oliverBedUpholsteryJsonLdOptions(
  product: Record<string, unknown>, selectors: CardExecutionSelectors
): OliverUpholsteryJsonLdOption[] | null {
  const expected = IDENTITIES[String(product.handle) as keyof typeof IDENTITIES]
  const variants = product.variants as Array<Record<string, unknown>> | undefined
  const metadata = product.metadata as Record<string, unknown> | undefined
  const tiers = metadata?.material_tiers as Record<string, { price_multiplier?: unknown }> | undefined
  const upholstery = selectors.upholstery
  if (!expected || product.id !== expected[0] || product.status !== "published" || variants?.length !== 1 ||
      variants[0]?.sku !== expected[1] || !tiers || Object.keys(tiers).length !== 1 ||
      Number(tiers.solid_full?.price_multiplier) !== 1 || upholstery?.length !== 2 ||
      new Set(upholstery.map((option) => option.key)).size !== 2 ||
      upholstery.some((option) => !["lillian", "lorna"].includes(option.key) || !option.label || !option.mainSrc) ||
      new Set(upholstery.map((option) => option.label)).size !== 2 || selectors.headboard?.length ||
      selectors.wood?.length || selectors.finish?.length || selectors.separateFabricRows?.length ||
      selectors.greenwichBedMatrix || selectors.greenwichPaintMatrix) return null
  return upholstery.map((option) => ({ key: option.key, label: option.label, images: [option.mainSrc, ...option.extraSrcs] }))
}

function imageUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base)
    return url.origin === new URL(base).origin && /^https?:$/.test(url.protocol) ? url.href : null
  } catch { return null }
}

/** Mirror the confirmed gallery/cart selection, keeping one native SKU and its Offer. */
export function selectedOliverBedUpholsteryJsonLd(input: {
  jsonLd: Record<string, unknown>
  productKey: string
  options: OliverUpholsteryJsonLdOption[]
  selection: PdpExecutionSelection | null
}): Record<string, unknown> | null {
  const { jsonLd, productKey, options, selection } = input
  let option = options[0]
  if (selection?.gate.productKey === productKey) {
    if (!selection.gate.complete || !selection.gate.combinationAvailable) return null
    const label = selection.specs.find((spec) => spec.label === "Обивка")?.value
    option = options.find((entry) => entry.label === label)
    if (!option) return null
    const selectedImage = selection.imageSrc ?? selection.gate.imageSrc
    if (!selectedImage || imageUrl(selectedImage, String(jsonLd.url)) !== imageUrl(option.images[0], String(jsonLd.url))) return null
  }
  if (!option) return null
  const images = Array.from(new Set(option.images.map((src) => imageUrl(src, String(jsonLd.url))).filter((src): src is string => !!src)))
  if (!images.length || images.length !== new Set(option.images).size) return null
  return {
    ...jsonLd,
    image: images,
    additionalProperty: [
      ...((jsonLd.additionalProperty as unknown[] | undefined) ?? []),
      { "@type": "PropertyValue", name: "Обивка", value: option.label },
    ],
  }
}
