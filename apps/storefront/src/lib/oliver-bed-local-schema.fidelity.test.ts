import assert from "node:assert/strict"
import { OLIVER_BED_FAMILY_COPY, sharedOliverBedDescription } from "./oliver-bed-family-copy"
import { oliverBedUpholsteryJsonLdOptions, selectedOliverBedUpholsteryJsonLd } from "./oliver-bed-upholstery-json-ld"
import type { PdpExecutionSelection } from "./cart/pdp-selection"

const intro = "Высокое арочное изголовье кровати собрано из мягкой панели в раме, с овальным медальоном по центру. По краям поднимаются точёные стойки с шарами-навершиями."
const product = (handle: string, id: string, sku: string, group: string, tail: string) => ({
  handle, id, status: "published", title: "Кровать (140×190)",
  description: `${intro}\n\n${tail}`,
  metadata: { display_group: group, material_tiers: { solid_full: { price_multiplier: 1 } } },
  variants: [{ sku }],
})
const small = product("ol-15-1", "prod_01KNTBXADF36E724RQTW6Z73B0", "OL-15-1", "ol-bed-15-16", "В изножье стоит такая же мягкая панель между стойками.")
const large = product("ol-16-1", "prod_01KNTBXADGPHKZEWKKT477WNR7", "OL-16-1", "ol-bed-15-16", "В изножье стоит такая же мягкая панель между стойками. Ткань обивки выбирается из 2 вариантов.")
assert.equal(sharedOliverBedDescription("ol-bed-15-16", [small, large]), OLIVER_BED_FAMILY_COPY["ol-bed-15-16"])
const smallOpen = product("ol-15-2", "prod_01KNTBXADG6TFW8WB9SPQ4JTGD", "OL-15-2", "ol-bed-15-16-open", "Изножья нет: спальное место заканчивается низкой царгой.")
const largeOpen = product("ol-16-2", "prod_01KNTBXADGH3EK5BM3RAZ2Z7KT", "OL-16-2", "ol-bed-15-16-open", "Изножья нет: спальное место заканчивается низкой царгой. Ткань обивки выбирается из 2 вариантов.")
assert.equal(sharedOliverBedDescription("ol-bed-15-16-open", [smallOpen, largeOpen]), OLIVER_BED_FAMILY_COPY["ol-bed-15-16-open"])
for (const copy of Object.values(OLIVER_BED_FAMILY_COPY)) assert.doesNotMatch(copy, /обив|ткан|Lilian|Lorna|\d/iu)
for (const sources of [[small, small], [small, largeOpen], [small, { ...large, id: "foreign" }], [small, null], [small, { ...large, description: "Другая конструкция" }]]) {
  assert.equal(sharedOliverBedDescription("ol-bed-15-16", sources), null)
}
const options = [
  { key: "lillian", label: "Lilian", images: ["/lilian.jpg", "/lilian-side.jpg"] },
  { key: "lorna", label: "Lorna", images: ["/lorna.jpg", "/lorna-side.jpg"] },
]
const selectors = { upholstery: options.map((entry) => ({ key: entry.key, label: entry.label, mainSrc: entry.images[0]!, extraSrcs: entry.images.slice(1) })) }
assert.equal(oliverBedUpholsteryJsonLdOptions(large, selectors)?.length, 2)
assert.equal(oliverBedUpholsteryJsonLdOptions(small, selectors), null, "OL-15 upholstery remains held even if options are supplied")
assert.equal(oliverBedUpholsteryJsonLdOptions({ ...large, id: "foreign" }, selectors), null)
const base = { "@type": "Product", sku: "OL-16-1", size: "140×190", url: "https://woodright.ru/product/ol-16-1", offers: { price: 113400, availability: "https://schema.org/BackOrder" }, image: ["/lilian.jpg"] }
const selection: PdpExecutionSelection = { imageSrc: "/lorna.jpg", specs: [{ label: "Обивка", value: "Lorna" }], gate: { productKey: "ol-16-1", requiresSelection: true, complete: true, combinationAvailable: true, missingLabels: [], specs: [] } }
const input = { jsonLd: base, productKey: "ol-16-1", options, selection }
const selected = selectedOliverBedUpholsteryJsonLd(input)!
assert.deepEqual(selected.image, ["https://woodright.ru/lorna.jpg", "https://woodright.ru/lorna-side.jpg"])
assert.deepEqual(selected.offers, base.offers)
assert.equal(selected.sku, base.sku)
assert.equal(selected.size, base.size)
assert.equal(selectedOliverBedUpholsteryJsonLd({ ...input, selection: { ...selection, imageSrc: "/lilian.jpg" } }), null)
assert.equal(selectedOliverBedUpholsteryJsonLd({ ...input, selection: { ...selection, gate: { ...selection.gate, complete: false } } }), null)
assert.deepEqual(selectedOliverBedUpholsteryJsonLd({ ...input, selection: { ...selection, gate: { ...selection.gate, productKey: "ol-16-2" } } })!.image, ["https://woodright.ru/lilian.jpg", "https://woodright.ru/lilian-side.jpg"])
assert.equal(selectedOliverBedUpholsteryJsonLd({ ...input, options: [{ ...options[1]!, images: ["https://other.example/lorna.jpg"] }], selection: null }), null)
console.log("oliver-bed-local-schema.fidelity.test.ts: ok")
