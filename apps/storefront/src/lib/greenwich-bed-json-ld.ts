import contract from "./greenwich-bed-json-ld-contract.json"
import type { CardExecutionSelectors } from "./card-color-media"
import type { PdpExecutionSelection, PdpExecutionSpec } from "./cart/pdp-selection"
import { defaultGreenwichBedSelection, resolveGreenwichBedMedia, greenwichBedInteriorUrlsFromProduct } from "./greenwich-bed-media"
import { resolvePdpMediaBundle } from "./product-images"
import { buildOfferJsonLd, offerAvailabilityFromPurchase, readUniformRubAmounts } from "./product-json-ld"
import { readProductPurchase } from "./woodright-order/purchase-contract"

type JsonLd = Record<string, unknown>
type Option = { specs: PdpExecutionSpec[]; images: string[] }
export type GreenwichBedJsonLdContext = { productKey: string; jsonLd: JsonLd; options: Option[]; opening: Option }
const matrixIdentity = (rows: unknown) => Array.isArray(rows) ? rows.map(r => r && typeof r === "object" ? [r.headboard_model, r.frame_material, r.fabric_upholstery, r.combo_key, r.urls] : null) : null

/** Five audited native sizes, both before and after their approved native merge. */
export function greenwichBedJsonLdContext(input: {
  product: JsonLd; selectedVariant: JsonLd | null; selectors: CardExecutionSelectors
  displayedPrice: number | null; materialTierCount: number; jsonLd: JsonLd
}): GreenwichBedJsonLdContext | null {
  const { product, selectors, jsonLd } = input
  const owner = contract.identities.find(r => r.id === product.id && r.handle === product.handle)
  const variants = product.variants as JsonLd[] | undefined
  const candidate = input.selectedVariant ?? (variants?.length === 1 ? variants[0] : null)
  const selected = variants?.find(v => v.id === candidate?.id && v.sku === candidate?.sku)
  const identity = contract.identities.find(r => r.variant_id === selected?.id && r.sku === selected?.sku)
  if (!owner || !identity || product.status !== "published" || !variants?.some(v => v.id === selected?.id) ||
      new Set(variants.map(v => v.id)).size !== variants.length ||
      variants.some(v => !contract.identities.some(r => r.variant_id === v.id && r.sku === v.sku)) ||
      (variants.length !== 1 && (owner.sku !== "GR-12-1" || variants.length !== 5)) ||
      (variants.length === 1 && owner.variant_id !== selected?.id) || input.materialTierCount > 1 ||
      selectors.finish?.length || selectors.separateFabricRows?.length || selectors.greenwichPaintMatrix ||
      !selectors.greenwichBedMatrix?.length) return null
  const meta = product.metadata as JsonLd | undefined
  const raw = meta?.bed_execution_matrix as typeof contract.matrix | undefined
  if (!Array.isArray(raw) || JSON.stringify(matrixIdentity(raw)) !== JSON.stringify(matrixIdentity(contract.matrix)) ||
      JSON.stringify(matrixIdentity(selectors.greenwichBedMatrix as typeof contract.matrix)) !== JSON.stringify(matrixIdentity(contract.matrix))) return null
  const amounts = readUniformRubAmounts({ variants: [selected] })
  const availability = offerAvailabilityFromPurchase(readProductPurchase(product))
  if (amounts?.length !== 1 || amounts[0] !== input.displayedPrice || !availability) return null
  const defaults = defaultGreenwichBedSelection(selectors.greenwichBedMatrix)
  const interiors = greenwichBedInteriorUrlsFromProduct(product)
  const options: Option[] = []
  let opening: Option | null = null
  for (const cell of selectors.greenwichBedMatrix) {
    const headboard = selectors.headboard?.find(r => r.key === cell.headboard_model)
    const wood = selectors.wood?.find(r => r.key === cell.frame_material)
    const upholstery = selectors.upholstery?.find(r => r.key === cell.fabric_upholstery)
    const media = resolveGreenwichBedMedia(selectors.greenwichBedMatrix, cell.headboard_model, cell.frame_material, cell.fabric_upholstery, { interiorUrls: interiors })
    if (!headboard || !wood || !upholstery || !media) return null
    const normalized = resolvePdpMediaBundle(media.mainSrc, media.extraSrcs)
    const option = { specs: [{ label: "Изголовье", value: headboard.label }, { label: "Обивка", value: upholstery.label }, { label: "Дерево", value: wood.label }], images: [normalized.mainSrc, ...normalized.extraSrcs] }
    options.push(option)
    if (cell.headboard_model === defaults.headboard && cell.frame_material === defaults.frameMaterial && cell.fabric_upholstery === defaults.fabric) opening = option
  }
  if (!opening) return null
  const url = new URL(String(jsonLd.url)); url.searchParams.set("variant", identity.variant_id)
  return { productKey: String(product.handle), options, opening, jsonLd: {
    ...jsonLd, sku: identity.sku, url: url.href, "@id": `${url.href}#product`,
    offers: buildOfferJsonLd({ url: url.href, priceRub: amounts[0], availability }),
  } }
}

/** The gallery's confirmed three-axis combination owns the only Product script. */
export function selectedGreenwichBedJsonLd(context: GreenwichBedJsonLdContext, selection: PdpExecutionSelection | null): JsonLd | null {
  let option = context.opening
  const own = selection?.gate.productKey === context.productKey
  if (own) {
    if (!selection.gate.complete || !selection.gate.combinationAvailable) return null
    const matched = context.options.filter(o => o.specs.every(s => selection.specs.filter(p => p.label === s.label && p.value === s.value).length === 1))
    if (matched.length !== 1 || selection.specs.length !== 3) return null
    option = matched[0]
  }
  const images = [...new Set(option.images.map(src => new URL(src, String(context.jsonLd.url)).href))]
  if (own && (!selection.imageSrc || new URL(selection.imageSrc, String(context.jsonLd.url)).href !== images[0])) return null
  return { ...context.jsonLd, image: images, additionalProperty: [
    ...((context.jsonLd.additionalProperty as unknown[] | undefined) ?? []),
    ...option.specs.map(s => ({ "@type": "PropertyValue", name: s.label, value: s.value })),
  ] }
}
