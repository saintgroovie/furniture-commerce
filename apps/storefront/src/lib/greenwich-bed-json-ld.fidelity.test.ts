import assert from "node:assert/strict"
import contract from "./greenwich-bed-json-ld-contract.json"
import { buildIntraProductExecutionSelectors } from "./card-color-media"
import { greenwichBedJsonLdContext, selectedGreenwichBedJsonLd } from "./greenwich-bed-json-ld"
import type { PdpExecutionSelection } from "./cart/pdp-selection"

const prices = [71900, 81100, 89700, 94000, 110400]
const variants = contract.identities.map((r, i) => ({ id: r.variant_id, sku: r.sku, calculated_price: { calculated_amount: prices[i], currency_code: "rub" } }))
const product = { ...contract.identities[1], status: "published", variants, purchase: { sales_mode: "configurable_to_order", purchase_flow: "cart", can_purchase: true }, metadata: { ...contract.axes, display_group: "greenwich-bed", bed_execution_matrix: contract.matrix, shared_scene_media: contract.shared_scene_media } }
const selectors = buildIntraProductExecutionSelectors(product, contract.matrix[0].urls[0])
const scalar = { "@context": "https://schema.org", "@type": "Product", name: "Кровать Гринвич", url: "https://woodright.ru/product/greenwich-gr-12-1", description: "Verified bed", image: ["https://woodright.ru/old.jpg"] }
let count = 0
for (const [i, variant] of variants.entries()) {
 const input = { product, selectedVariant: variant, selectors, displayedPrice: prices[i], materialTierCount: 1, jsonLd: scalar }
 const context = greenwichBedJsonLdContext(input); assert(context)
 const opening = selectedGreenwichBedJsonLd(context, null)!; assert.equal(opening.sku, variant.sku); assert.equal((opening.offers as any).price, prices[i]); assert.equal((opening.offers as any).availability, "https://schema.org/BackOrder"); assert(new URL(String(opening.url)).searchParams.get("variant") === variant.id)
 for (const option of context.options) {
  const selection: PdpExecutionSelection = { imageSrc: option.images[0], specs: option.specs, gate: { productKey: context.productKey, requiresSelection: true, complete: true, combinationAvailable: true, missingLabels: [], specs: option.specs } }
  const selected = selectedGreenwichBedJsonLd(context, selection)!; assert.equal((selected.image as string[])[0], new URL(option.images[0], String(scalar.url)).href); assert.deepEqual(selected.offers, opening.offers); assert.equal((selected.additionalProperty as unknown[]).length, 3); count++
  assert.equal(selectedGreenwichBedJsonLd(context, { ...selection, gate: { ...selection.gate, complete: false } }), null)
  assert.equal(selectedGreenwichBedJsonLd(context, { ...selection, gate: { ...selection.gate, combinationAvailable: false } }), null)
  assert.equal(selectedGreenwichBedJsonLd(context, { ...selection, imageSrc: "/foreign.jpg" }), null)
  assert.equal(selectedGreenwichBedJsonLd(context, { ...selection, specs: [] }), null)
  assert.deepEqual(selectedGreenwichBedJsonLd(context, { ...selection, gate: { ...selection.gate, productKey: "foreign" } }), opening)
 }
 assert.equal(greenwichBedJsonLdContext({ ...input, displayedPrice: prices[i] + 1 }), null)
 assert.equal(greenwichBedJsonLdContext({ ...input, materialTierCount: 2 }), null)
 assert.equal(greenwichBedJsonLdContext({ ...input, selectedVariant: { ...variant, sku: "GR-02-2" } }), null)
 assert.equal(greenwichBedJsonLdContext({ ...input, product: { ...product, id: "foreign" } }), null)
 assert.equal(greenwichBedJsonLdContext({ ...input, product: { ...product, status: "draft" } }), null)
 assert.equal(greenwichBedJsonLdContext({ ...input, product: { ...product, metadata: { ...product.metadata, bed_execution_matrix: contract.matrix.slice(1) } } }), null)
 assert.equal(greenwichBedJsonLdContext({ ...input, product: { ...product, metadata: { ...product.metadata, bed_execution_matrix: [null] } } }), null)
 assert.equal(greenwichBedJsonLdContext({ ...input, product: { ...product, variants: [variants[0], ...variants.slice(0, 4)] } }), null)
 const own = contract.identities[i]
 assert(greenwichBedJsonLdContext({ ...input, product: { ...product, id: own.id, handle: own.handle, variants: [variant] } }))
}
assert.equal(count, 55)
console.log("greenwich-bed-json-ld.fidelity.test.ts:55confirmed combinations + invalid, stale, foreign, drift guards PASS")
