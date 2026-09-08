/**
 * Kids PDP cart CTA vs stale launch_mode=request_quote.
 *
 *   yarn dlx tsx src/lib/request-quote.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isRequestQuoteProduct } from "./request-quote"
import { getBuyerFacingProductTitle } from "./product-metadata"
import { actions, productCta } from "./woodright-copy"
import {
  ctaLabelForDirectCartPurchase,
  isDirectCartPurchase,
  isQuoteLikePurchase,
} from "./woodright-order/purchase-contract"

const kidsWw = {
  handle: "ba-62-1",
  title: "Стеллаж для книг Ballet (гл. 440)",
  product_classification: { product_type: "CONFIGURABLE" },
  metadata: {
    collection: "willie-winkie",
    storefront_section: "kids",
    launch_mode: "request_quote",
    family_canonical_title: "Стеллаж для книг",
    motif_slug: "ballet",
    painting_name: "Ballet",
    family_options: { Размер: "гл.440", "Роспись (мотив)": "Ballet" },
  },
  variants: [{ id: "variant_ba-62-1", sku: "ba-62-1" }],
}

const adultQuote = {
  handle: "ol-01-1",
  title: "Стол Oliver",
  product_classification: { product_type: "STANDARD" },
  metadata: { collection: "oliver", launch_mode: "request_quote" },
}

const adultConfigurable = {
  handle: "gr-05-1",
  title: "Комод Greenwich",
  product_classification: { product_type: "CONFIGURABLE" },
  metadata: { collection: "greenwich" },
}

const kidsBespoke = {
  handle: "kids-bespoke",
  title: "Проект",
  product_classification: { product_type: "BESPOKE" },
  metadata: {
    storefront_section: "kids",
    launch_mode: "request_quote",
  },
}

assert.equal(isRequestQuoteProduct(kidsWw), false)
assert.equal(isRequestQuoteProduct(adultQuote), true)
assert.equal(isRequestQuoteProduct(adultConfigurable), false)
assert.equal(isRequestQuoteProduct(kidsBespoke), true)

const kidsExplicitQuote = {
  ...kidsWw,
  handle: "ba-62-1-quote",
  product_sales_policy: { sales_mode: "quote_required" },
}
assert.equal(isRequestQuoteProduct(kidsExplicitQuote), true)

const kidsQuoteDto = {
  ...kidsWw,
  purchase: {
    sales_mode: "quote_required",
    can_purchase: false,
    purchase_flow: "quote",
    reason_code: "QUOTE_REQUIRED",
  },
}
assert.equal(isRequestQuoteProduct(kidsQuoteDto), true)

const kidsCartAttached = {
  ...kidsWw,
  purchase: {
    sales_mode: "configurable_to_order",
    can_purchase: true,
    purchase_flow: "cart",
  },
}
assert.equal(isRequestQuoteProduct(kidsCartAttached), false)

const kidsConflictCartDtoQuotePolicy = {
  ...kidsWw,
  handle: "ba-62-1-conflict",
  purchase: {
    sales_mode: "configurable_to_order",
    can_purchase: true,
    purchase_flow: "cart",
  },
  product_sales_policy: { sales_mode: "quote_required" },
}
assert.equal(isRequestQuoteProduct(kidsConflictCartDtoQuotePolicy), true)

const kidsCartDto = {
  sales_mode: "configurable_to_order" as const,
  can_purchase: true,
  purchase_flow: "cart" as const,
}
assert.equal(isDirectCartPurchase(kidsCartDto), true)
assert.equal(isQuoteLikePurchase(kidsCartDto), false)
assert.equal(
  ctaLabelForDirectCartPurchase(kidsCartDto, actions.addToCart),
  "Добавить в корзину"
)

const title = getBuyerFacingProductTitle(kidsWw)
assert.equal(title, "Стеллаж для книг")
assert.doesNotMatch(title, /Баллет|Ballet|гл\.|440/)

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const ctaSrc = readFileSync(join(root, "src/components/product-cta.tsx"), "utf8")
assert.match(ctaSrc, /await addLineItem\(cartId,/)
assert.match(ctaSrc, /isDirectCartPurchase\(purchase\)/)
assert.doesNotMatch(
  ctaSrc,
  /if \(isRequestQuoteProduct\(product\)\)[\s\S]*isKidsStorefrontProduct/
)
assert.equal(productCta.requestQuoteCtaLabel, "Оставить заявку")
assert.match(ctaSrc, /copy\.requestQuoteCtaLabel/)
assert.match(ctaSrc, /if \(isRequestQuoteProduct\(product\)\)/)
assert.match(
  ctaSrc,
  /isQuoteLikePurchase\(purchase\) \|\| isRequestQuoteProduct\(product\)/
)

console.log("request-quote.fidelity.test.ts: ok")
