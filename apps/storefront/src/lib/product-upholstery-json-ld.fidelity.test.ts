import assert from "node:assert/strict"
import auditedContract from "./audited-upholstery-jsonld-contract.json"
import { buildProductJsonLd, jsonLdHtml } from "./product-json-ld"
import { selectedUpholsteryJsonLd, supportsUpholsteryJsonLd } from "./product-upholstery-json-ld"

const jsonLd = buildProductJsonLd({ name: "Банкетка", sku: "PV-55-1", url: "https://woodright.ru/product/pv-55-1",
  offerPriceRub: 19900, offerAvailability: "https://schema.org/BackOrder" })
const options = [
  { label: "Серая полоска · молочный каркас", images: ["/product-static/stripe.jpg"] },
  { label: "Светлая · тёмный каркас", images: ["/product-static/plain.jpg", "/product-static/angle.jpg", "/product-static/angle.jpg"] },
]
const gate = { productKey: "pv-55-1", requiresSelection: true, complete: true, combinationAvailable: true, missingLabels: [], specs: [] }
const selection = { gate, specs: [{ label: "Обивка", value: options[1].label }] }
function markup(pick = selection as typeof selection | null) {
  return selectedUpholsteryJsonLd({ jsonLd, options, productKey: "pv-55-1", selection: pick })
}
assert.equal((markup(null)!.additionalProperty as any)[0].value, options[0].label)
const selected = markup()!
assert.deepEqual(selected.image, ["https://woodright.ru/product-static/plain.jpg", "https://woodright.ru/product-static/angle.jpg"])
assert.deepEqual(selected.offers, jsonLd.offers)
assert.equal(selected.sku, "PV-55-1")
assert.equal((selected.additionalProperty as any)[0].value, options[1].label)
assert.equal("hasVariant" in selected, false) // Coupled frames never generate a Cartesian product.
assert.equal(markup({ ...selection, specs: [] }), null)
assert.equal(markup({ ...selection, gate: { ...gate, complete: false } }), null)
assert.equal(markup({ ...selection, gate: { ...gate, combinationAvailable: false } }), null)
assert.equal((markup({ ...selection, gate: { ...gate, productKey: "other-product" } })!.additionalProperty as any)[0].value, options[0].label)
assert.equal(selectedUpholsteryJsonLd({ jsonLd, options: [{ label: "Unsafe URL", images: ["javascript:alert(1)"] }], productKey: "x", selection: null }), null)
const unsafeLabel = "</script><script>alert(1)</script>"
const escapedProduct = selectedUpholsteryJsonLd({ jsonLd, options: [{ label: unsafeLabel, images: ["/product-static/safe.jpg"] }], productKey: "x", selection: null })!
assert.equal(escapedProduct["@type"], "Product")
assert.equal((escapedProduct.additionalProperty as any)[0].value, unsafeLabel)
const escaped = jsonLdHtml(escapedProduct)
assert.doesNotMatch(escaped, /</)
assert.match(escaped, /\\u003c\/script>/)
assert.equal(JSON.parse(escaped).additionalProperty[0].value, unsafeLabel)
const approved = auditedContract["pv-55-1"]
const product = { id: approved.id, handle: "pv-55-1", status: "published", variants: [{ id: approved.variant_id, sku: approved.sku }], metadata: {
  finish_metadata_source: "audited_upholstery_photo_mapping_20261021", fabric_upholstery_executions: approved.executions,
} }
const upholstery = approved.executions.map((o) => ({ key: o.key, label: o.label, mainSrc: o.urls[0], extraSrcs: o.urls.slice(1) }))
const selectors = { confidence: "canonical" as const, upholstery }
assert(supportsUpholsteryJsonLd(product, selectors))
assert(!supportsUpholsteryJsonLd({ ...product, status: "draft" }, selectors))
assert(!supportsUpholsteryJsonLd({ ...product, variants: [{}, {}] }, selectors))
assert(!supportsUpholsteryJsonLd(product, { ...selectors, finish: upholstery }))
assert(!supportsUpholsteryJsonLd({ ...product, metadata: { ...product.metadata, material_tiers: { solid_full: { price_multiplier: .8 } } } }, selectors))
assert(!supportsUpholsteryJsonLd({ ...product, metadata: { ...product.metadata, material_tiers: { solid_full: { price_multiplier: 1 }, another: { price_multiplier: .8 } } } }, selectors))
assert(!supportsUpholsteryJsonLd({ ...product, id: "foreign-product" }, selectors))
assert(!supportsUpholsteryJsonLd({ ...product, handle: "ol-15-1" }, selectors))
assert(!supportsUpholsteryJsonLd({ ...product, variants: [{ id: approved.variant_id, sku: "OL-15-1" }] }, selectors))
assert(!supportsUpholsteryJsonLd({ ...product, metadata: { ...product.metadata, fabric_upholstery_executions: approved.executions.map((e, i) => i === 0 ? { ...e, urls: ["/static/wrong-photo.jpg"] } : e) } }, selectors))
assert(!supportsUpholsteryJsonLd(product, { ...selectors, upholstery: upholstery.map((e, i) => i === 0 ? { ...e, label: "unapproved" } : e) }))
assert(!supportsUpholsteryJsonLd(product, { ...selectors, upholstery: upholstery.map((e, i) => i === 0 ? { ...e, mainSrc: "/product-static/wrong.jpg" } : e) }))
assert(!supportsUpholsteryJsonLd(product, { ...selectors, upholstery: upholstery.map((e, i) => i === 0 ? { ...e, extraSrcs: ["/product-static/wrong-angle.jpg"] } : e) }))
for (const [handle, entry] of Object.entries(auditedContract)) {
 const p = { ...product, id: entry.id, handle, variants: [{ id: entry.variant_id, sku: entry.sku }], metadata: { ...product.metadata, fabric_upholstery_executions: entry.executions } }
 assert(supportsUpholsteryJsonLd(p, { ...selectors, upholstery: entry.executions.map((e) => ({ key: e.key, label: e.label, mainSrc: e.urls[0], extraSrcs: e.urls.slice(1) })) }), handle)
}
console.log("product-upholstery-json-ld.fidelity.test.ts: ok")
