import assert from "node:assert/strict"
import { configuredPriceJsonLdContext, selectedConfiguredPriceJsonLd } from "./configured-price-json-ld"
import scope from "./configured-price-json-ld-scope.json"
import { resolveConfiguredUnitPrice as backendPrice, resolveFinishColorMultiplier as backendColor } from "../../../backend/src/lib/finish-color-premium-contract"
import type { PdpExecutionSelection } from "./cart/pdp-selection"
import type { MaterialTierOption } from "./material-tiers"
const identity = scope["co-69-1"]
const paints = [{ key: "cream", label: "Молочный" }, { key: "blue", label: "Голубой" }]
const product = { id: identity.id, handle: "co-69-1", status: "published",
  variants: [{ id: identity.variantId, sku: identity.sku, calculated_price: { calculated_amount: 4300, currency_code: "rub" } }],
  metadata: { paint_finish_executions: paints } }
const selectors = { finish: paints.map((paint) => ({ ...paint, mainSrc: "/preserved.jpg", extraSrcs: [] })) }
const context = configuredPriceJsonLdContext({ product, selectors, basePrice: 4300, materialTiers: null })!
assert.ok(context)
const markup = { "@context": "https://schema.org", "@type": "Product", name: "Полка Кантри", sku: identity.sku,
  image: ["https://woodright.ru/product-static/preserved-new-photo.jpg"],
  offers: { "@type": "Offer", price: 4300, priceCurrency: "RUB", availability: "https://schema.org/BackOrder", url: "https://woodright.ru/product/co-69-1", seller: { "@id": "#organization" } } }
function pick(finishKey = "blue", productKey = "co-69-1"): PdpExecutionSelection {
  return { specs: [], gate: { productKey, requiresSelection: true, complete: true, combinationAvailable: true,
    missingLabels: [], specs: [], finishKey, standardFinishKey: "cream" } }
}
function project(selection: PdpExecutionSelection | null, extra = {}) {
  return selectedConfiguredPriceJsonLd({ jsonLd: markup, context, selection, materialSelection: null, ...extra })
}
assert.equal(project(null), markup)
assert.equal(project(pick("blue", "previous-pdp")), markup)
const before = JSON.stringify(markup)
for (const key of ["cream", "blue", "cream", "blue"]) {
  const ld = project(pick(key))!
  assert.equal((ld.offers as Record<string, unknown>).price, backendPrice(4300, 1, backendColor(product.metadata, key)))
  assert.deepEqual(ld.image, markup.image)
  assert.deepEqual({ ...ld.offers as object, price: 4300 }, markup.offers)
  assert.equal(ld.name, markup.name); assert.equal(ld.sku, markup.sku)
}
assert.equal(JSON.stringify(markup), before)
assert.equal((project(pick())!.offers as Record<string, unknown>).price, 4515)
assert.equal(project({ ...pick(), gate: { ...pick().gate, complete: false } }), null)
assert.equal(project({ ...pick(), gate: { ...pick().gate, combinationAvailable: false } }), null)
assert.equal(project(pick("unknown")), null)
assert.equal(project({ ...pick(), gate: { ...pick().gate, standardFinishKey: "blue" } }), null)
assert.equal(project(pick(), { materialSelection: { productKey: "co-69-1", code: "unknown" } }), null)
for (const changed of [{ ...product, id: "another-id" }, { ...product, status: "draft" },
  { ...product, handle: "ol-15-1" }, { ...product, handle: "greenwich-gr-02-2" },
  { ...product, variants: [...product.variants, product.variants[0]] }])
  assert.equal(configuredPriceJsonLdContext({ product: changed, selectors, basePrice: 4300, materialTiers: null }), null)
assert.equal(configuredPriceJsonLdContext({ product, selectors, basePrice: NaN, materialTiers: null }), null)
assert.equal(configuredPriceJsonLdContext({ product, selectors: { finish: [...selectors.finish].reverse() }, basePrice: 4300, materialTiers: null }), null)
const tiers: MaterialTierOption[] = [
  { code: "solid_front_ldsp_body", label: "Фасады из массива + корпус ЛДСП", multiplier: 36800 / 77650, position: 0, price: 36800, description: null },
  { code: "solid_full", label: "Полностью из массива", multiplier: 1, position: 1, price: 77650, description: null } ]
const materialContext = { ...context, productKey: "greenwich-gr-67-1", basePrice: 77650, materialTiers: tiers }
const group = { "@context": "https://schema.org", "@type": "ProductGroup", "@id": "https://woodright.ru/product/greenwich-gr-67-1#materials",
  name: "Полка Гринвич", productGroupID: "materials", brand: { "@type": "Brand", name: "Woodright" }, variesBy: ["https://schema.org/material"],
  hasVariant: tiers.map((tier) => ({ ...markup, material: tier.label, url: `https://woodright.ru/product/greenwich-gr-67-1?material=${tier.code}`,
    offers: { ...markup.offers, price: tier.price } })) }
const groupBefore = JSON.stringify(group)
for (const tier of tiers) for (const finish of ["cream", "blue"]) {
  const ld = selectedConfiguredPriceJsonLd({ jsonLd: group, context: materialContext,
    selection: pick(finish, materialContext.productKey), materialSelection: { productKey: materialContext.productKey, code: tier.code } })!
  assert.equal(ld["@type"], "Product"); assert.equal(ld.material, tier.label)
  assert.equal((ld.offers as Record<string, unknown>).price, backendPrice(77650, tier.multiplier, backendColor(product.metadata, finish)))
  assert.equal("hasVariant" in ld, false); assert.equal("hasVariant" in (ld.isVariantOf as object), false)
  assert.deepEqual(ld.image, markup.image)
}
assert.equal(JSON.stringify(group), groupBefore)
console.log("configured-price-json-ld: cart parity, tier/color return, photos/policies, identity/navigation and invalid-selection guards passed")
