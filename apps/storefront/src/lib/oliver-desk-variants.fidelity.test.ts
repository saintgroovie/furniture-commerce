import assert from "node:assert/strict"
import { buildProductJsonLd } from "./product-json-ld"
import { materialOptionsForUrl } from "./product-variant-json-ld"
import { buildOliverDeskJsonLd, oliverDeskAxis, oliverDeskMedia, oliverDeskTextProduct, verifiedOliverDesk } from "./oliver-desk-variants"

const right = "/static/imports/WR-PFW-20260721T020528Z/25cc40df99f115319a41da4dacea181ec29b7c449e13ec65a134769398ab9774.jpg"
const left = "/static/imports/WR-PFW-20260721T020528Z/0e8dbdc6733f2d174e3d041d33bc25738aa61a8871c1e24e404afd6baeb51df1.jpg"
const product = {
  id: "desk", handle: "ol-65", status: "published", title: "Стол письменный 1-тумб.",
  description: "Одна тумба этого стола стоит справа. Слева остаётся открытое место для ног и стула.",
  subtitle: "Письменный стол с одной тумбой, тумба справа.",
  metadata: {
    family_key: "oliver:t65:stol-pismennyi-n-tumb",
    material_tiers: {
      solid_full: { key: "solid_full", label_ru: "Полностью из массива", price_multiplier: 1, position: 1 },
      solid_front_ldsp_body: { key: "solid_front_ldsp_body", label_ru: "Фасады из массива + корпус ЛДСП", price_multiplier: 65300 / 89900, price_rub: 65300, position: 0 },
    },
    buyer_default_configuration: { variant_id: "right", min_unit_price: 65300, material_execution_code: "solid_front_ldsp_body", material_price_multiplier: 65300 / 89900, color_multiplier: 1 },
  },
  variants: [
    { id: "right", sku: "OL-65-1", title: "Слева без наполнения, справа полки", metadata: { woodright_import: { raw_code: "0П", package_sku: "OL-65-1" } }, calculated_price: { calculated_amount: 89900, currency_code: "rub" } },
    { id: "left", sku: "OL-65-2", title: "Слева полки, справа без наполнения", metadata: { woodright_import: { raw_code: "П0", package_sku: "OL-65-2" } }, calculated_price: { calculated_amount: 89900, currency_code: "rub" } },
  ],
  images: [{ url: right }, { url: left }, { url: "/static/new-photo.jpg" }],
  purchase: { sales_mode: "configurable_to_order", can_purchase: true, purchase_flow: "cart", stock_relevant: false },
}
const desk = verifiedOliverDesk(product)!
assert.ok(desk)
assert.deepEqual(oliverDeskAxis(desk).choices.map((c) => [c.id, c.label]), [["right", "Тумба справа"], ["left", "Тумба слева"]])
const scalar = buildProductJsonLd({ name: "Однотумбовый письменный стол Оливер", url: "https://woodright.ru/product/ol-65", images: [right, left], dimensions: [{ axis: "width", mm: 1162 }] })
const group = buildOliverDeskJsonLd(product, desk, scalar)!
const variants = group.hasVariant as Array<Record<string, any>>
assert.equal(variants.length, 4)
assert.equal(new Set(variants.map((v) => v.productID)).size, 4)
assert.equal(new Set(variants.map((v) => v["@id"])).size, 4)
assert.equal("offers" in group, false)
for (const variant of variants) {
  const url = new URL(variant.url)
  const chosen = desk.choices.find((choice) => choice.id === url.searchParams.get("variant"))!
  const material = materialOptionsForUrl(desk.materials, url.searchParams.get("material")!)[0]
  assert.equal(variant.sku, chosen.sku)
  assert.equal(variant.material, material.label)
  assert.equal(variant.offers.price, material.price)
  assert.equal(variant.offers.url, variant.url)
  assert.equal(variant.offers.availability, "https://schema.org/BackOrder")
  assert.ok(variant.offers.hasMerchantReturnPolicy["@id"])
  assert.ok(variant.offers.shippingDetails.hasShippingService["@id"])
  assert.equal(variant.width.value, 1162)
  assert.equal(variant.image[0], new URL(chosen.hero.replace("/static/", "/product-static/"), variant.url).href)
  assert.equal(variant.description, oliverDeskTextProduct(product, desk, chosen.id).description)
}
assert.equal(oliverDeskTextProduct(product, desk, "left").subtitle, "Письменный стол с одной тумбой, тумба слева.")
assert.equal(product.subtitle, "Письменный стол с одной тумбой, тумба справа.")
const allImages = product.images.map((image) => image.url.replace("/static/", "/product-static/"))
const media = oliverDeskMedia(desk, "left", allImages[0], allImages.slice(1))
assert.equal(media.mainSrc, allImages[1])
assert.deepEqual([media.mainSrc, ...media.extraSrcs], [allImages[1]])
// Regression: the left/right switch must replace the entire gallery, including
// after the user previously selected a detail photo. Prices and axes stay above.
const imported = (name: string) => "/static/imports/WR-PFW-20260721T020528Z/" + name
const rightAngle = imported("4d684e60dddd51d91391e9f278372ed9cb9c49c39f91e83c6965cc38b705d3b1.jpg")
const leftAngle = imported("5eef871cfb0c0fa19676f75ee530dea350e2fc91f5ebf7a105bff40ae129a226.jpg")
const directional = { ...product, images: [...product.images, { url: rightAngle }, { url: leftAngle }] }
const scoped = verifiedOliverDesk(directional)!
assert.ok(scoped)
const visible = directional.images.map(({url}) => url.replace("/static/", "/product-static/"))
const leftMedia = oliverDeskMedia(scoped, "left", visible[3], visible.filter((x) => x !== visible[3]))
assert.deepEqual([leftMedia.mainSrc, ...leftMedia.extraSrcs], [visible[1], visible[4]])
const rightMedia = oliverDeskMedia(scoped, "right", visible[4], visible.filter((x) => x !== visible[4]))
assert.deepEqual([rightMedia.mainSrc, ...rightMedia.extraSrcs], [visible[0], visible[3]])
assert.equal(oliverDeskAxis(scoped).choices.length, 2)
assert.deepEqual(oliverDeskMedia(scoped, "unknown", visible[0], visible.slice(1)), {mainSrc:visible[0],extraSrcs:visible.slice(1)})
assert.equal(verifiedOliverDesk({ ...product, variants: [...product.variants].reverse() })?.choices[0].sku, "OL-65-1")
assert.equal(verifiedOliverDesk({ ...product, images: [product.images[0]] }), null)
assert.equal(verifiedOliverDesk({ ...product, status: "draft" }), null)
assert.equal(verifiedOliverDesk({ ...product, variants: product.variants.map((v) => v.id === "left" ? { ...v, calculated_price: { ...v.calculated_price, calculated_amount: 90000 } } : v) }), null)
assert.equal(verifiedOliverDesk({ ...product, variants: product.variants.map((v) => v.id === "left" ? { ...v, metadata: { woodright_import: { raw_code: "0П", package_sku: v.sku } } } : v) }), null)
assert.equal(verifiedOliverDesk({ ...product, metadata: { ...product.metadata, buyer_default_configuration: { ...product.metadata.buyer_default_configuration, min_unit_price: 65000 } } }), null)
console.log("oliver-desk-variants.fidelity.test.ts: ok")

// Review P2: preferred hero absent must never restore opposite-side frames.
assert.deepEqual(oliverDeskMedia(scoped, "left", visible[0], [visible[3], visible[4]]), { mainSrc: visible[4], extraSrcs: [] })
assert.deepEqual(oliverDeskMedia(scoped, "left", visible[0], [visible[3]]), { mainSrc: "", extraSrcs: [] })
