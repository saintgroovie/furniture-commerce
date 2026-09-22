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
} from "./product-json-ld"
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
