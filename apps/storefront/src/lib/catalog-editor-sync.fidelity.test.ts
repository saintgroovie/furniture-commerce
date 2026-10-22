import assert from "node:assert/strict"
import { basicBody, imagesBody, variantBody } from "../../../workspace/src/server/catalog-policy.mjs"
import { buyerVariantAxis, resolveBuyerVariantId } from "./buyer-variant-axis"
import { getPrice, priceOfVariant, pdpVariantPrice } from "./format"
import { buildProductJsonLd, readUniformRubAmounts } from "./product-json-ld"
import { buildNativeVariantJsonLd } from "./native-variant-json-ld"
import { cardThumbnailSrcFromProduct } from "./card-color-media"
import { collectExtraProductImageUrls, resolvePdpMediaSrc } from "./product-images"
import { getBuyerDescription, getSeoDescriptionSource } from "./product-seo"

// Contract fixture only; this test never writes a catalog or publishes a product.
const product: Record<string, any> = {
  id: "prod_contract", handle: "contract", status: "published", title: "Комод",
  description: "Исходное описание.", metadata: {},
  purchase: { sales_mode: "made_to_order", purchase_flow: "cart", can_purchase: true },
  product_classification: { product_type: "STANDARD" },
  thumbnail: "/static/before.jpg", images: [{ id: "img_before", url: "/static/before.jpg" }],
  options: [{ id: "opt", title: "Default", values: [{value:"Default"},{value:"С ящиками"}] }],
  variants: [{ id: "v1", title: "Базовый", sku: "CONTRACT-1", options: [{ option_id: "opt", value: "Default" }],
    prices: [{ id: "eur", currency_code: "eur", amount: 95 },
      { id: "bulk", currency_code: "rub", amount: 12000, min_quantity: 10 },
      { id: "base", currency_code: "rub", amount: 12345.67 }] }],
}
Object.assign(product, basicBody({ title: "Комод", subtitle: "", description: "Описание после сохранения в админке." }))
Object.assign(product, imagesBody({ images: ["/static/new.jpg","/static/before.jpg"], thumbnail: "/static/new.jpg" },
  product, { execution_media_guard: false }, ["/static/new.jpg"]))
const updated = variantBody({ variantId: "v1", title: "Базовый", sku: "CONTRACT-1", price: "12400,50", options: {opt:"Default"} },product)
Object.assign(product.variants[0], { ...updated, options: [{option_id:"opt",value:"Default"}] })
const added = variantBody({ title: "С ящиками", sku: "CONTRACT-2", price: "20500,75", options: {opt:"С ящиками"} },product)
product.variants.push({...added,id:"v2", options:[{option_id:"opt",value:"С ящиками"}]})
assert.equal(product.variants[0].prices.find((p: any)=>p.id==='eur').amount,95)
assert.equal(product.variants[0].prices.find((p: any)=>p.id==='bulk').amount,12000)
assert.equal(priceOfVariant(product.variants[0]),12400.50)
assert.equal(priceOfVariant(product.variants[1]),20500.75)
assert.deepEqual(readUniformRubAmounts(product),[12400.50,20500.75])
assert.equal(getPrice({...product,variants:[product.variants[0]]}),12400.50)
const axis=buyerVariantAxis(product)!
assert.equal(axis.label,"Исполнение")
assert.deepEqual(axis.choices.map(c=>c.label),["Базовый","С ящиками"])
assert.equal(resolveBuyerVariantId(axis,undefined),"v1")
assert.equal(resolveBuyerVariantId(axis,"v2"),"v2")
assert.equal(getBuyerDescription(product),"Описание после сохранения в админке.")
assert.equal(cardThumbnailSrcFromProduct(product),"/product-static/new.jpg")
const commonImages=[cardThumbnailSrcFromProduct(product),...collectExtraProductImageUrls(product,cardThumbnailSrcFromProduct(product)).map(resolvePdpMediaSrc)]
const scalar=buildProductJsonLd({name:product.title,description:getSeoDescriptionSource(product),url:"https://woodright.ru/product/contract",images:commonImages})
function markup(p=product,id="v1",price=pdpVariantPrice(product,product.variants.find((v:any)=>v.id===id))) {
  return buildNativeVariantJsonLd({product:p,jsonLd:scalar,selectedVariantId:id,displayedPriceRub:price,commonImages})
}
const ld=markup()!
assert.equal(ld["@type"],"ProductGroup")
assert.equal("variesBy" in ld,false)
assert.equal(ld.description,getBuyerDescription(product))
const variants=ld.hasVariant as Record<string,any>[]
for (const [i,v] of variants.entries()) {
  assert.equal(v.sku,product.variants[i].sku)
  assert.equal(v.offers.price,priceOfVariant(product.variants[i]))
  assert.equal(new URL(v.url).searchParams.get('variant'),product.variants[i].id)
  assert.equal(v.offers.url,v.url)
  assert.equal(v.offers.availability,"https://schema.org/BackOrder")
  assert.deepEqual(v.image,["https://woodright.ru/product-static/new.jpg","https://woodright.ru/product-static/before.jpg"])
}
assert.equal(JSON.stringify(markup(product,"v2")),JSON.stringify(ld))
assert.doesNotMatch(JSON.stringify(ld),/aggregateRating|review|InStock/)
assert.equal(markup(product,"v2",12400.50),null)
assert.equal(markup({...product,status:"draft"}),null)
assert.equal(markup({...product,product_classification:{product_type:"BESPOKE"}}),null)
assert.equal(markup({...product,variants:[product.variants[0],{...product.variants[1],prices:[]}]}),null)
assert.equal(priceOfVariant({prices:[{currency_code:"eur",amount:95}]}),null)
assert.equal(priceOfVariant({prices:[{currency_code:"rub",amount:100,min_quantity:10}]}),null)
assert.equal(priceOfVariant({prices:[{currency_code:"rub",amount:100},{currency_code:"rub",amount:200}]}),null)
assert.equal(priceOfVariant({calculated_price:{calculated_amount:90,currency_code:"eur"},prices:[{currency_code:"rub",amount:100}]}),null)
assert.equal(priceOfVariant({calculated_price:{calculated_amount:12000.15,currency_code:"rub"}}),12000.15)
console.log("catalog-editor-sync.fidelity.test.ts ok")
