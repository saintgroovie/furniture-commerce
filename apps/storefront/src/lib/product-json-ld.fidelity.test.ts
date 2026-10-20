/**
 * Product JSON-LD truthfulness and PDP canonical identity.
 *
 *   yarn dlx tsx src/lib/product-json-ld.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildBreadcrumbJsonLd,
  buildProductJsonLd,
  jsonLdHtml,
  productCanonicalPath,
  readUniformRubAmounts,
  singleOfferPriceRub,
  offerAvailabilityFromPurchase,
} from "./product-json-ld"
import { buildMerchantPolicyJsonLd, merchantPolicyIds } from "./merchant-policy-json-ld"
import { buildLegalPage } from "./legal/legal-content"
import { seo } from "./woodright-copy"

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/product/[id]/page.tsx"),
  "utf8"
)

assert.equal(
  productCanonicalPath({ handle: "greenwich-gr-67-1" }, "prod_01ABC"),
  "/product/greenwich-gr-67-1"
)
assert.equal(
  productCanonicalPath({ handle: "" }, "prod_01ABC"),
  "/product/prod_01ABC"
)
assert.equal(
  productCanonicalPath({ handle: "../evil" }, "prod_01ABC"),
  "/product/prod_01ABC"
)

const named = buildProductJsonLd({
  name: "Кровать Greenwich",
  description: "Описание",
  url: "https://example.test/product/greenwich-gr-67-1",
  image: "https://example.test/img.jpg",
  sku: "GR-67-1",
  offerPriceRub: 120000,
})
assert.equal(named.name, "Кровать Greenwich")
assert.equal(named.sku, "GR-67-1")
assert.equal((named.offers as { priceCurrency: string }).priceCurrency, "RUB")
assert.equal((named.offers as { price: number }).price, 120000)
assert.equal(JSON.stringify(named).includes("AggregateRating"), false)
assert.equal(JSON.stringify(named).includes("Review"), false)
assert.equal((named.brand as { name: string }).name, "Woodright")

const craft = buildProductJsonLd({
  name: "Тумбочка для рукоделия", sku: "OL-08-Н", offerPriceRub: 32500,
  url: "https://woodright.ru/product/ol-08-n",
  images: ["/product-static/imports/perspective.jpg", "/product-static/imports/front.jpg", "/product-static/imports/front.jpg", "javascript:alert(1)", ""],
  dimensions: [{ axis: "height", mm: 908 }, { axis: "width", mm: 550 }, { axis: "depth", mm: 555 }],
  offerAvailability: offerAvailabilityFromPurchase({ sales_mode: "configurable_to_order", purchase_flow: "cart", can_purchase: true }),
})
assert.equal(craft.sku, "OL-08-Н")
assert.equal((craft.offers as { price: number }).price, 32500)
assert.deepEqual(craft.image, ["https://woodright.ru/product-static/imports/perspective.jpg", "https://woodright.ru/product-static/imports/front.jpg"])
assert.deepEqual(craft.height, { "@type": "QuantitativeValue", value: 908, unitCode: "MMT" })
assert.deepEqual(craft.width, { "@type": "QuantitativeValue", value: 550, unitCode: "MMT" })
assert.deepEqual(craft.depth, { "@type": "QuantitativeValue", value: 555, unitCode: "MMT" })
const craftOffer = craft.offers as Record<string, unknown>
assert.equal(craftOffer.availability, "https://schema.org/BackOrder")
assert.deepEqual(craftOffer.hasMerchantReturnPolicy, { "@id": "https://woodright.ru/returns#return-policy" })
assert.deepEqual(craftOffer.shippingDetails, { "@type": "OfferShippingDetails", hasShippingService: { "@id": "https://woodright.ru/delivery#shipping-service" } })
assert.equal(offerAvailabilityFromPurchase(null), null)
assert.equal(offerAvailabilityFromPurchase({ sales_mode: "in_stock", purchase_flow: "cart", can_purchase: true }), "https://schema.org/InStock")
assert.equal(offerAvailabilityFromPurchase({ sales_mode: "in_stock", purchase_flow: "cart", can_purchase: false }), null)
assert.equal(offerAvailabilityFromPurchase({ sales_mode: "made_to_order", purchase_flow: "cart" }), "https://schema.org/BackOrder")
assert.equal(offerAvailabilityFromPurchase({ sales_mode: "made_to_order", purchase_flow: "quote" }), null)
assert.equal(offerAvailabilityFromPurchase({ sales_mode: "unavailable" }), "https://schema.org/OutOfStock")
assert.equal(offerAvailabilityFromPurchase({ sales_mode: "showroom_sample", purchase_flow: "cart", can_purchase: true }), null)
const policies = buildMerchantPolicyJsonLd("https://woodright.ru/product/ol-08-n")
assert.equal(policies.hasMerchantReturnPolicy.merchantReturnLink, "https://woodright.ru/returns")
assert.equal(policies.hasMerchantReturnPolicy["@id"], merchantPolicyIds("https://woodright.ru").returns)
assert.equal(policies.hasShippingService["@id"], merchantPolicyIds("https://woodright.ru").shipping)
for (const paragraph of buildLegalPage("delivery").lead) assert.ok(policies.hasShippingService.description.includes(paragraph))
assert.ok(policies.hasShippingService.description.includes("Публичного фиксированного тарифа нет"))
assert.doesNotMatch(JSON.stringify(policies), /shippingRate|deliveryTime|shippingDestination|merchantReturnDays|returnPolicyCategory|AggregateRating|Review/)
assert.match(src, /offerAvailabilityFromPurchase\(readProductPurchase\(product\)\)/)
const variableSize = buildProductJsonLd({ name: "Стол", url: "https://woodright.ru/product/table", dimensions: [{axis: "width"}, {axis: "height", mm: NaN}, {axis: "depth", mm: -1}] })
assert.equal("width" in variableSize || "height" in variableSize || "depth" in variableSize, false)

const baseOffer = {
  productType: "STANDARD" as const,
  requestQuote: false,
  materialTierCount: 0,
  displayGroupCount: 0,
  displayedPriceRub: 100,
}

const quote = singleOfferPriceRub({
  ...baseOffer,
  requestQuote: true,
  variantAmounts: [100],
})
assert.equal(quote, null)

const bespoke = singleOfferPriceRub({
  ...baseOffer,
  productType: "BESPOKE",
  variantAmounts: [100],
})
assert.equal(bespoke, null)

const tiers = singleOfferPriceRub({
  ...baseOffer,
  materialTierCount: 2,
  variantAmounts: [100],
})
assert.equal(tiers, null)

const family = singleOfferPriceRub({
  ...baseOffer,
  displayGroupCount: 2,
  variantAmounts: [100],
})
assert.equal(family, null)

const split = singleOfferPriceRub({
  ...baseOffer,
  variantAmounts: [100, 140],
})
assert.equal(split, null)

const mismatch = singleOfferPriceRub({
  ...baseOffer,
  displayedPriceRub: 90,
  variantAmounts: [100],
})
assert.equal(mismatch, null)

const unresolved = singleOfferPriceRub({
  ...baseOffer,
  variantAmounts: null,
})
assert.equal(unresolved, null)

const same = singleOfferPriceRub({
  ...baseOffer,
  displayedPriceRub: 88000,
  variantAmounts: [88000, 88000],
})
assert.equal(same, 88000)

assert.equal(
  readUniformRubAmounts({
    variants: [{ calculated_price: { calculated_amount: 10, currency_code: "usd" } }],
  }),
  null
)
assert.equal(
  readUniformRubAmounts({
    variants: [
      { calculated_price: { calculated_amount: 10, currency_code: "rub" } },
      { prices: [{ amount: 12 }] },
    ],
  }),
  null
)
assert.deepEqual(
  readUniformRubAmounts({
    variants: [
      { calculated_price: { calculated_amount: 88000, currency_code: "RUB" } },
    ],
  }),
  [88000]
)

const escaped = jsonLdHtml({ sku: "</script><script>" })
assert.equal(escaped.includes("<"), false)
assert.match(src, /jsonLdHtml/)
assert.match(src, /isRequestQuoteProduct\(product\)/)

const noOffer = buildProductJsonLd({
  name: "Шкаф по проекту",
  url: "https://example.test/product/x",
  offerPriceRub: null,
})
assert.equal("offers" in noOffer, false)

const crumbs = buildBreadcrumbJsonLd("https://example.test", [
  { name: "Каталог", path: "/catalog" },
  { name: "Кровать Greenwich", path: "/product/greenwich-gr-67-1" },
])
assert.equal(crumbs["@type"], "BreadcrumbList")
const list = crumbs.itemListElement as Array<{ name: string; item: string }>
assert.equal(list[0].item, "https://example.test/catalog")
assert.equal(list[1].name, "Кровать Greenwich")

assert.match(src, /buildProductJsonLd/)
assert.match(src, /buildBreadcrumbJsonLd/)
assert.match(src, /productCanonicalPath/)
assert.match(src, /getBuyerFacingProductTitle/)
assert.doesNotMatch(src, /AggregateRating|aggregateRating/)

assert.equal(
  seo.willieWinkieMotif("Молли").title.includes("| Woodright"),
  false
)
assert.equal(seo.home.title.startsWith("Woodright"), true)

console.log("product-json-ld.fidelity.test.ts: ok")
