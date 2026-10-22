import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { getCatalogProducts } from "./api/products"
import { getMotifContext, type MotifProductCard } from "./api/motif-themes"
import { motifCatalogIndex, refreshMotifCards } from "./motif-card-catalog"
import { resolveCatalogCardPrice } from "./catalog-card-price"
import { groupProductsForDisplay } from "./display-group"
import { applyCatalogFilters } from "./catalog-filters"
import { ProductCard } from "../components/product-card"
import { PdpRelatedInMotif } from "../components/pdp-related-in-motif"

// Store DTO snapshots before and after an admin edit; no production write.
// Native editor persistence has its own workspace contract and server drill.
const native: Record<string, any> = {
  id:"prod_card_contract", handle:"card-contract", status:"published", title:"Комод",
  metadata:{}, product_classification:{product_type:"STANDARD"},
  thumbnail:"/static/old.jpg", images:[{url:"/static/old.jpg"}],
  variants:[{id:"v_contract",sku:"CARD-CONTRACT",title:"Базовый", prices:[{currency_code:"rub",amount:10000}]}],
}
const oldCard: MotifProductCard = {handle:"card-contract",title:"Комод",thumbnail:"/static/obsolete.jpg",price_amount:95,motif_key:"ballet",motif_slug:"ballet",motif_title:"Балет",family_title:"Комод"}
let current = structuredClone(native)
const calls: RequestInit[] = []
const requested: string[] = []
const originalFetch = globalThis.fetch
const oldBackend = process.env.MEDUSA_BACKEND_INTERNAL_URL
process.env.MEDUSA_BACKEND_INTERNAL_URL="http://catalog-contract.invalid"
const globals=globalThis as typeof globalThis & {React?: typeof React}
const oldReact=globals.React; globals.React=React

globalThis.fetch = async (input, init) => {
  calls.push(init ?? {})
  const url=String(input)
  requested.push(url)
  const parsed = new URL(url)
  if(parsed.pathname === "/store/catalog-products") return Response.json({products:
    !parsed.searchParams.has("handle") || parsed.searchParams.get("handle") === current.handle ? [current] : []})
  if(url.includes("/store/motif-context?")) return Response.json({motif_context:{
    handle:"origin",motif_status:"matched",selected_motif:{motif_key:"ballet",motif_slug:"ballet",motif_title:"Балет"},redirect_handle:null,
    motif_options:[{motif_key:"ballet",motif_slug:"ballet",motif_title:"Балет",motif_cover:"/static/obsolete.jpg",product_handle:"card-contract",title:"Комод",price_amount:95,selected:true}],
    related_products_in_motif:[oldCard],motif_page_path:"/kids/willie-winkie/ballet",
  }})
  throw new Error("Unexpected request: "+url)
}

async function renderSurfaces(expectedPrice:number, expectedPhoto:string) {
  const data=await getCatalogProducts()
  const rows=applyCatalogFilters(data.products,{category:[],collection:[],q:"CARD-CONTRACT"})
  assert.equal(rows.length,1,"fresh search uses the same updated product pool")
  const entry=groupProductsForDisplay(rows)[0]!
  assert.equal(resolveCatalogCardPrice(entry.product).amount,expectedPrice)
  const card=renderToStaticMarkup(React.createElement(ProductCard,{product:entry.product as never,displayGroup:entry.displayGroup}))
  assert.ok(card.includes(expectedPhoto),"actual catalog/search card renders the updated photo")
  assert.ok(card.includes(expectedPrice.toLocaleString("ru-RU")),"actual catalog/search card renders exact price")
  const from = requested.length
  const context=(await getMotifContext({handle:"origin"}))!
  const cardReads = requested.slice(from).filter(url => new URL(url).pathname === "/store/catalog-products")
  assert.equal(cardReads.length,1,"related and motif options share one exact handle read")
  assert.equal(new URL(cardReads[0]!).searchParams.get("handle"),"card-contract","PDP never loads the full catalog")
  assert.equal(context.related_products_in_motif[0]!.price_amount,expectedPrice,"related ignores stale motif scalar")
  assert.equal(context.motif_options[0]!.price_amount,expectedPrice)
  const related=renderToStaticMarkup(React.createElement(PdpRelatedInMotif,{products:context.related_products_in_motif,motifSlug:"ballet",motifPagePath:context.motif_page_path}))
  assert.ok(related.includes(expectedPhoto),"actual related card renders the updated photo")
  assert.ok(related.includes(expectedPrice.toLocaleString("ru-RU")))
  assert.ok(calls.every(c=>c.cache==="no-store"),"no completed read may use a stale-while-revalidate snapshot")
}

async function main() {
try {
 await renderSurfaces(10000,"/product-static/old.jpg")
 // A fresh native browse response after saving a new photo and exact RUB price.
 current={...structuredClone(native),description:"Описание после сохранения",thumbnail:"/static/new.jpg",images:[{url:"/static/new.jpg"}],
   variants:[{...native.variants[0],prices:[{currency_code:"rub",amount:12500.75}],calculated_price:{calculated_amount:12500.75,original_amount:12500.75,currency_code:"rub"}}]}
 await renderSurfaces(12500.75,"/product-static/new.jpg")
 const sale={...current,variants:[{...current.variants[0],calculated_price:{calculated_amount:11000.25,original_amount:12500.75,currency_code:"rub",is_calculated_price_price_list:true}}]}
 assert.equal(refreshMotifCards([oldCard],motifCatalogIndex([sale]))[0]!.price_amount,11000.25)
 assert.deepEqual(refreshMotifCards([oldCard],motifCatalogIndex([{...current,status:"draft"} ])),[])
 assert.deepEqual(refreshMotifCards([oldCard],motifCatalogIndex([current,current,current])),[])
 assert.deepEqual(refreshMotifCards([oldCard],motifCatalogIndex([])),[])
 const quote={...current,metadata:{launch_mode:"request_quote"}}
 assert.equal(refreshMotifCards([oldCard],motifCatalogIndex([quote]))[0]!.price_amount,null)
 console.log("catalog-card-live-sync.fidelity.test.ts: ok")
} finally {
 globalThis.fetch=originalFetch
 if(oldBackend===undefined) delete process.env.MEDUSA_BACKEND_INTERNAL_URL
 else process.env.MEDUSA_BACKEND_INTERNAL_URL=oldBackend
 if(oldReact===undefined) delete globals.React; else globals.React=oldReact
}

}
void main().catch(error=>{console.error(error);process.exitCode=1})
