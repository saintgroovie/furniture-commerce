import auditedContract from "./audited-upholstery-jsonld-contract.json"
import type { CardExecutionSelectors } from "./card-color-media"
import type { PdpExecutionSelection } from "./cart/pdp-selection"

export type UpholsteryJsonLdOption = { label: string; images: string[] }

/** Audited, single-SKU fabric executions only. Mixed axes need their own contract. */
export function supportsUpholsteryJsonLd(
  product: Record<string, unknown>, selectors: CardExecutionSelectors
): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  const audited = (auditedContract as Record<string, typeof auditedContract["ol-55-1"]>)[String(product.handle)]
  const variants = product.variants as Array<Record<string, unknown>> | undefined
  const executions = meta?.fabric_upholstery_executions
  if (!audited || product.id !== audited.id || variants?.length !== 1 ||
    variants[0]?.id !== audited.variant_id || variants[0]?.sku !== audited.sku || !Array.isArray(executions)) return false
  // The approved mapping is a release contract, not permission granted by a marker alone.
  const mapping = executions.map((entry) => ({ key: entry.key, label: entry.label, urls: entry.urls }))
  if (JSON.stringify(mapping) !== JSON.stringify(audited.executions) ||
    selectors.upholstery?.length !== audited.executions.length ||
    selectors.upholstery.some((option, index) => option.key !== audited.executions[index].key ||
      option.label !== audited.executions[index].label ||
      JSON.stringify([option.mainSrc, ...option.extraSrcs].map((src) => src.replace(/^\/static\//, "/product-static/"))) !==
        JSON.stringify(audited.executions[index].urls.map((src) => src.replace(/^\/static\//, "/product-static/"))))) return false
  const tiers = meta?.material_tiers
  if (tiers != null && (typeof tiers !== "object" || Array.isArray(tiers) ||
    Object.keys(tiers).length !== 1 ||
    Number((tiers as Record<string, Record<string, unknown>>).solid_full?.price_multiplier) !== 1)) return false
  return product.status === "published" && Array.isArray(product.variants) && product.variants.length === 1 &&
    meta?.finish_metadata_source === "audited_upholstery_photo_mapping_20261021" &&
    (selectors.upholstery?.length ?? 0) > 1 && !selectors.headboard?.length &&
    !selectors.wood?.length && !selectors.finish?.length && !selectors.separateFabricRows?.length &&
    !selectors.greenwichBedMatrix && !selectors.greenwichPaintMatrix
}

/**
 * One commercial Product, with the execution actually selected in the gallery.
 * Fabrics are line-item metadata, not invented native SKUs or stock variants.
 * The same default is rendered on the server; no client-only opening markup.
 */
export function selectedUpholsteryJsonLd(input: {
  jsonLd: Record<string, unknown>
  productKey: string
  options: UpholsteryJsonLdOption[]
  selection: PdpExecutionSelection | null
}): Record<string, unknown> | null {
  const { jsonLd, productKey, options, selection } = input
  let option = options[0]
  if (selection?.gate.productKey === productKey) {
    if (!selection.gate.complete || !selection.gate.combinationAvailable) return null
    const label = selection.specs.find((spec) => spec.label === "Обивка")?.value
    const matched = options.find((entry) => entry.label === label)
    // Do not publish another execution's photo or Offer after an invalid/stale pick.
    if (!matched) return null
    option = matched
  }
  if (!option) return null
  const images = Array.from(new Set(option.images.flatMap((src) => {
    try {
      const url = new URL(src, String(jsonLd.url))
      return /^https?:$/.test(url.protocol) ? [url.href] : []
    } catch { return [] }
  })))
  if (!images.length) return null
  return {
    ...jsonLd, image: images,
    // Keep the complete visible label, including pattern and coupled frame on PV-55-1.
    // Do not guess fabric composition or split these into independent axes.
    additionalProperty: [
      ...((jsonLd.additionalProperty as unknown[] | undefined) ?? []),
      { "@type": "PropertyValue", name: "Обивка", value: option.label },
    ],
  }
}
