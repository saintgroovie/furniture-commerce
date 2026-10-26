import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { getBuyerFacingProductTitleLayout } from "./product-metadata"
import { presentBuyerCartLine, presentBuyerOptionChoice } from "./product-title-presentation"
import { withBuyerTitleProperties } from "./product-title-json-ld"
import { buildProductJsonLd } from "./product-json-ld"
import { buildNativeVariantJsonLd } from "./native-variant-json-ld"
import { buildMaterialVariantJsonLd, buildSizeVariantJsonLd } from "./product-variant-json-ld"
import { buildMaterialTierOptions } from "./material-tiers"
import { buildOliverDeskJsonLd } from "./oliver-desk-variants"
import { buildProvenceFinishJsonLd } from "./provence-finish-json-ld"
import { roomPageJsonLd, motifPageJsonLd } from "./editorial-page-json-ld"
type Row = Record<string, any>
const plain = (s: string) => s.replace(/\u00a0/g, " ")
const purchase = { sales_mode: "configurable_to_order", can_purchase: true, purchase_flow: "cart" }
const price = (n: number) => ({ calculated_amount: n, currency_code: "rub" })
const reports: Row[] = []
function scalar(product: Row, variant?: Row) {
  const layout = getBuyerFacingProductTitleLayout(product, variant)
  return withBuyerTitleProperties(buildProductJsonLd({ name: layout.text,
    url: `https://woodright.ru/product/${product.handle}`, sku: variant?.sku ?? product.variants?.[0]?.sku,
    images: ["/product-static/fixture.jpg"], dimensions: [{ axis: "height", mm: 780 }],
    offerPriceRub: 10000, offerAvailability: "https://schema.org/BackOrder",
  }), layout.attributes)
}
function same(product: Row, variant?: Row) {
  const before = JSON.stringify(product)
  const card = getBuyerFacingProductTitleLayout(product), pdp = getBuyerFacingProductTitleLayout(product, variant)
  const line = { title: product.title, product, variant, variant_id: variant?.id, variant_sku: variant?.sku }
  const beforeLine = JSON.stringify(line), cart = presentBuyerCartLine(line)!, ld = scalar(product, variant)
  assert.equal(card.text, pdp.text); assert.equal(cart.base_title, card.text)
  assert.equal(cart.caption, pdp.caption); assert.equal(ld.name, card.text)
  assert.equal(JSON.stringify(product), before); assert.equal(JSON.stringify(line), beforeLine)
  reports.push({ handle: product.handle, before: product.title, card: card.text, pdp: pdp.text,
    cart: cart.base_title, schema: ld.name, separately: plain(pdp.caption), selected_sku: variant?.sku })
  return ld
}
const desk = { id: "desk", status: "published", handle: "pv-66-7", title: "Стол письменный 2-тумб. ЯП", purchase,
  options: [{ id: "fill", title: "Наполнение" }], variants: ["ЯП", "ПП"].map((title, i) => ({ id: `d${i}`, sku: `PV-66-${i + 1}`, title,
    options: [{ option_id: "fill", value: title }], calculated_price: price(10000) })) }
const deskLd = same(desk, desk.variants[1])
assert.equal(reports.at(-1)!.separately, "Полки с обеих сторон")
const nativeDesk = buildNativeVariantJsonLd({ product: desk, jsonLd: deskLd, selectedVariantId: "d1",
  displayedPriceRub: 10000, commonImages: ["https://woodright.ru/product-static/fixture.jpg"] }) as Row
assert.ok(nativeDesk); assert.equal(nativeDesk.name, deskLd.name)
for (const child of nativeDesk.hasVariant) {
  assert.equal(child.name, deskLd.name)
  assert.ok(child.additionalProperty.some((p: Row) => p.name === "Наполнение тумб"))
}
const bed = { id: "bed", status: "published", handle: "greenwich-gr-12-1", title: "Кровать 1,5-сп. (120×200)", purchase,
  options: [{ id: "size", title: "Размер" }], variants: ["120 × 200", "180 × 200"].map((title, i) => ({
    id: `b${i}`, sku: `GR-${i}`, title, options: [{ option_id: "size", value: title }], calculated_price: price(10000) })) }
const bedLd = same(bed, bed.variants[1])
assert.equal(bedLd.name, "Кровать Гринвич"); assert.equal(plain(String(bedLd.size)), "180 × 200 см")
assert.doesNotMatch(reports.at(-1)!.separately, /120|полутораспальная/)
const nativeBed = buildNativeVariantJsonLd({ product: bed, jsonLd: bedLd, selectedVariantId: "b1", displayedPriceRub: 10000,
  commonImages: ["https://woodright.ru/product-static/fixture.jpg"] }) as Row
assert.ok(nativeBed)
assert.deepEqual(nativeBed.hasVariant.map((v: Row) => [v.name, plain(v.size)]),
  [[bedLd.name, "120 × 200 см"], [bedLd.name, "180 × 200 см"]])
// N6/N7 had no confirmed PASS after Grok's last patch.
const n6 = same({ ...bed, metadata: { display_group: "greenwich-bed" } }, { ...bed.variants[1], metadata: {} })
assert.equal(plain(String(n6.size)), "180 × 200 см")
assert.equal(plain(presentBuyerOptionChoice("Размер", "600 × 400")!.valueLabel), "600 × 400")
assert.equal(plain(presentBuyerOptionChoice("Размер", "600 × 400 см")!.valueLabel), "600 × 400 см")
// Review P2: native option values must win over arbitrary variant titles.
const optionBed = { ...bed, options: undefined }
const chosenBed = { ...bed.variants[1], title: "Большая", options: [
  { value: "180 × 200", option: { title: "Размер" } },
] }
assert.equal(plain(String(same(optionBed, chosenBed).size)), "180 × 200 см")
assert.doesNotMatch(reports.at(-1)!.separately, /120|полутораспальная/)
const chosenDesk = { ...desk.variants[1], title: "С полками", options: [
  { value: "ПП", option: { title: "Наполнение" } },
] }
same({ ...desk, options: undefined }, chosenDesk)
assert.equal(reports.at(-1)!.separately, "Полки с обеих сторон")
const bodyLd = same({ handle: "custom-desk", title: "Стол глубина 440 мм, высота 1,2 м, ширина 120 см" }) as Row
assert.equal(bodyLd.height.value, 780)
assert.ok(bodyLd.additionalProperty.some((p: Row) => p.name === "Габариты" && /В 1,2.+Ш 120.+Г 440/.test(p.value)))
assert.equal(same({ handle: "custom-atelier", title: "Ателье 1905" }).name, "Ателье 1905")
function family(size: string, id: string) { return { id, status: "published", handle: `greenwich-${id}`, title: `Кровать 1,5-сп. (${size})`,
  metadata: { display_group: "greenwich-bed", display_group_title: "сырой заголовок", material_tiers: { solid_full: { price_multiplier: 1 } } },
  purchase, variants: [{ id: `v-${id}`, sku: id, calculated_price: price(10000) }] } }
const small = family("120×200", "small"), large = family("180×200", "large")
const familyLd = buildSizeVariantJsonLd({ product: small, siblings: [large], jsonLd: same(small), displayedPriceRub: 10000, requestQuote: false }) as Row
assert.ok(familyLd); assert.equal(familyLd.isVariantOf.name, familyLd.name); assert.equal(familyLd.name, same(large).name)
const material = { id: "material", handle: "ol-05-1", title: "Комод глубина 440 мм", status: "published", purchase,
  metadata: { material_tiers: {
    solid_front_ldsp_body: { key: "solid_front_ldsp_body", label_ru: "Фасады из массива + корпус ЛДСП", price_multiplier: .75, position: 0, price_rub: 7500 },
    solid_full: { key: "solid_full", label_ru: "Полностью из массива", price_multiplier: 1, position: 1 } },
    buyer_default_configuration: { min_unit_price: 7500, variant_id: "vm", material_execution_code: "solid_front_ldsp_body", material_price_multiplier: .75, color_multiplier: 1 } },
  variants: [{ id: "vm", sku: "OL-05-1", calculated_price: price(10000) }] }
const materials = buildMaterialTierOptions(material)!
const materialLd = buildMaterialVariantJsonLd({ product: material, jsonLd: same(material), options: materials, requestQuote: false }) as Row
assert.ok(materialLd)
assert.equal(materialLd.name, "Комод Оливер")
for (const child of materialLd.hasVariant) { assert.equal(child.name, materialLd.name); assert.ok(child.material); assert.ok(child.sku) }
const pv = { id: "pv", title: "Комод", status: "published", handle: "pv-05-2", purchase,
  metadata: { workbook_row_key: "provence:PV-05-2", finish_metadata_source: "provence_paint_wood_split" },
  variants: [{ id: "vpv", sku: "PV-05-2", calculated_price: price(66600) }] }
const pvLd = buildProvenceFinishJsonLd(pv, same(pv), [
  { key: "cream", label: "Кремовый", mainSrc: "/product-static/cream.jpg", extraSrcs: [] },
  { key: "wood", label: "Дерево", mainSrc: "/product-static/wood.jpg", extraSrcs: [] } ]) as Row
assert.ok(pvLd)
for (const child of pvLd.hasVariant) { assert.equal(child.name, pvLd.name); assert.ok(child.color); assert.equal(child.sku, "PV-05-2") }
const oliverLd = buildOliverDeskJsonLd({ ...desk, handle: "ol-65", title: "Стол письменный 1-тумб." }, { choices: [
  { id: "right", sku: "OL-65-1", label: "Тумба справа", hero: "/product-static/right.jpg" },
  { id: "left", sku: "OL-65-2", label: "Тумба слева", hero: "/product-static/left.jpg" } ], materials }, scalar({ handle: "ol-65", title: "Стол письменный 1-тумб." })) as Row
assert.ok(oliverLd)
for (const child of oliverLd.hasVariant) { assert.equal(child.name, oliverLd.name); assert.ok(child.additionalProperty[0].value); assert.ok(child.material) }
const room = roomPageJsonLd("https://woodright.ru", { slug: "room", title: "Комната", is_active: true, items: [{ product: desk }] }) as Row
const motif = motifPageJsonLd("https://woodright.ru", { motif_slug: "fairies", motif_title: "Феи", products: [desk] }, null) as Row
for (const graph of [room, motif]) assert.equal(graph["@graph"][2].itemListElement[0].name, deskLd.name)
const outputs = [nativeDesk, nativeBed, familyLd, materialLd, pvLd, oliverLd]
for (const output of outputs) {
  assert.equal(JSON.parse(JSON.stringify(output))["@type"], output["@type"])
  assert.ok(!JSON.stringify(output).includes("aggregateRating"))
}
if (process.env.NAMING_EVIDENCE_DIR) {
  writeFileSync(`${process.env.NAMING_EVIDENCE_DIR}/before-after.json`, JSON.stringify(reports, null, 2))
  writeFileSync(`${process.env.NAMING_EVIDENCE_DIR}/schema-samples.json`, JSON.stringify(outputs, null, 2))
}
console.log("PASS: new naming/schema paths; N6/N7; selected sizes/filling; family/native/material/finish/desk/editorial; immutable inputs")
