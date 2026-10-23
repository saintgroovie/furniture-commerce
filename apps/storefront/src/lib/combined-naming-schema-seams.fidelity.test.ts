import assert from "node:assert/strict"
import { buildProductJsonLd } from "./product-json-ld"
import { buildOliverFacadeJsonLd, verifiedOliverFacadeConfigurations } from "./oliver-facade-json-ld"
import { selectedOliverFacadeJsonLd } from "./selected-oliver-facade-json-ld"
import { getBuyerFacingProductTitleLayout } from "./product-metadata"
import { presentBuyerCartLine } from "./product-title-presentation"
import { resolveEditorialProducts } from "./editorial-shopping-data"
import { roomDirectoryJsonLd, roomPageJsonLd } from "./editorial-page-json-ld"

// Source-backed D02 shape: two native SKUs, exactly three approved combinations.
// This checks the new naming/Oliver/UI seam, not a repeat of the full R2 suite.
const full = { key: "solid_full", label_ru: "Полностью из массива", price_multiplier: 1, position: 1 }
const mixed = { key: "solid_front_ldsp_body", label_ru: "Фасады из массива + корпус ЛДСП", price_multiplier: 32500 / 34950, price_rub: 32500, position: 0 }
const variant = (id: string, sku: string, label: string, price: number, tiers: Record<string, unknown>, sort: number) => ({
  id, sku, title: "Произвольное название исполнения",
  calculated_price: { calculated_amount: price, currency_code: "rub" },
  options: [{ option_id: "facade", value: label, option: { title: "Исполнение фасада" } }],
  metadata: {
    capabilities: { material_tiers: tiers }, gallery_urls: [`/static/${id}-front.jpg`, `/static/${id}-side.jpg`],
    dimensions: { width_mm: 500, depth_mm: 455, height_mm: 650 },
    variant_axes: { facade: { label: "Исполнение фасада", display: label, sort } },
  },
})
const product = {
  id: "prod_combined_ol08", handle: "ol-08-1", status: "published", title: "Прикроватная тумба Оливер",
  thumbnail: "/static/open-front.jpg", options: [{ id: "facade", title: "Исполнение фасада" }],
  product_classification: { product_type: "CONFIGURABLE" },
  purchase: { sales_mode: "configurable_to_order", purchase_flow: "cart", can_purchase: true },
  metadata: { collection: "oliver-kids", buyer_default_configuration: {
    variant_id: "open", material_execution_code: mixed.key, min_unit_price: 32500,
    material_price_multiplier: mixed.price_multiplier, color_multiplier: 1,
  } },
  variants: [
    variant("door", "OL-08-2", "С дверкой", 39950, { solid_full: full }, 1),
    variant("open", "OL-08-1", "С открытой полкой", 34950, { solid_full: full, solid_front_ldsp_body: mixed }, 0),
  ],
}
const before = JSON.stringify(product)
const title = getBuyerFacingProductTitleLayout(product)
const scalar = buildProductJsonLd({ name: title.text, sku: "OL-08-1", url: "https://woodright.ru/product/ol-08-1", images: ["/product-static/open-front.jpg"] })
const configs = verifiedOliverFacadeConfigurations(product)
assert(configs)
const group = buildOliverFacadeJsonLd(product, configs, scalar)!
assert.equal(group.name, title.text)
assert.equal(group["@type"], "ProductGroup")
const members = group.hasVariant as Array<Record<string, unknown>>
assert.equal(members.length, 3)
for (let i = 0; i < members.length; i++) {
  const member = members[i]!, config = configs[i]!
  const selected = product.variants.find(v => v.id === config.variantId)!
  const selectedTitle = getBuyerFacingProductTitleLayout(product, selected)
  const cartTitle = presentBuyerCartLine({ title: product.title, product, variant: selected })!
  assert.equal(member.name, selectedTitle.text, "Product.name must use the visible base, not material/facade suffixes")
  assert.equal(member.name, cartTitle.base_title, "New Oliver group and the frozen cart presenter share the base")
  assert.equal(member.name, group.name)
  assert.equal(member.material, config.material.label)
  assert.deepEqual(member.additionalProperty, [{ "@type": "PropertyValue", name: "Исполнение фасада", value: config.label }])
  assert.equal(member.sku, config.sku)
  assert.equal(member.productID, `${config.variantId}:${config.material.code}`)
  assert.deepEqual(member.isVariantOf, { "@id": group["@id"] })
  const url = new URL(String(member.url))
  assert.equal(url.searchParams.get("variant"), config.variantId)
  assert.equal(url.searchParams.get("material"), config.material.code)
  const offer = member.offers as Record<string, unknown>
  assert.equal(offer.price, config.material.price)
  assert.equal(offer.url, url.href)
  assert.equal(offer.availability, "https://schema.org/BackOrder")
  const active = selectedOliverFacadeJsonLd(group, config.variantId, config.material.code)!
  assert.equal(active.name, title.text)
  assert.equal((active.offers as Record<string, unknown>).price, config.material.price)
  assert.equal(active.sku, config.sku)
}

const hotspot = resolveEditorialProducts([product], [product.handle])[product.handle]
assert(hotspot)
assert.equal(hotspot.title, title.text, "UI hotspot inherits the same naming provider through HomeProduct")
assert.equal(hotspot.href, `/product/${product.id}`)
const directory = roomDirectoryJsonLd("https://woodright.ru", [
  { id: "room", slug: "spalnya-cloud", title: "Спальня Cloud", is_active: true },
], false, "Комнаты")!
const graph = directory["@graph"] as Array<Record<string, unknown>>
assert.equal(graph[0]!.name, "Комнаты")
assert.equal(((graph[1]!.itemListElement as Array<Record<string, unknown>>).at(-1))!.name, "Комнаты")
const room = roomPageJsonLd("https://woodright.ru", {
  slug: "spalnya-cloud", title: "Спальня Cloud", is_active: true,
  items: [{ sort_order: 0, product }],
})!
const list = (room["@graph"] as Array<Record<string, unknown>>).find(n => n["@type"] === "ItemList")!
assert.equal((list.itemListElement as Array<Record<string, unknown>>)[0]!.name, title.text)
assert.equal(JSON.stringify(product), before, "Joint presentation must not mutate product, SKU, price or options")
console.log("Combined naming/Oliver/room/hotspot seams: passed")
