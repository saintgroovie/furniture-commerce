import assert from "node:assert/strict"
import { selectedExecutionImageJsonLd } from "./execution-image-json-ld"
import type { PdpExecutionSelection } from "./cart/pdp-selection"

const jsonLd = { "@type": "Product", url: "https://woodright.ru/product/co-02-1", sku: "CO-02-1",
  description: "Описание из Medusa", image: ["https://woodright.ru/product-static/initial.jpg"],
  offers: { price:88830, priceCurrency:"RUB", availability:"https://schema.org/BackOrder" } }
const selection: PdpExecutionSelection = { imageSrc:"/product-static/products/country-london-paris/CO-02-1_color_blue_02.jpg", specs:[],
  gate:{productKey:"co-02-1",complete:true,requiresSelection:true,combinationAvailable:true,missingLabels:[],specs:[]} }
const project=(s:PdpExecutionSelection|null)=>selectedExecutionImageJsonLd({jsonLd,productKey:"co-02-1",selection:s})
assert.equal(project(null),jsonLd)
assert.equal(project({...selection,gate:{...selection.gate,productKey:"old-page"}}),jsonLd)
const before=JSON.stringify(jsonLd);const chosen=project(selection)!
assert.deepEqual(chosen.image,["https://woodright.ru/product-static/products/country-london-paris/CO-02-1_color_blue_02.jpg"])
assert.deepEqual({...chosen,image:jsonLd.image},jsonLd)
assert.equal(JSON.stringify(jsonLd),before)
assert.equal(project({...selection,gate:{...selection.gate,complete:false}}),null)
assert.equal(project({...selection,gate:{...selection.gate,combinationAvailable:false}}),null)
assert.equal(project({...selection,imageSrc:"javascript:alert(1)"}),null)
assert.deepEqual(project({...selection,imageSrc:"https://api.woodright.ru/static/owned.jpg"})!.image,["https://woodright.ru/product-static/owned.jpg"])
assert.deepEqual(project({...selection,imageSrc:undefined,gate:{...selection.gate,imageSrc:"/static/owned.jpg"}})!.image,["https://woodright.ru/product-static/owned.jpg"])
console.log("execution-image-json-ld.fidelity.test.ts ok")
