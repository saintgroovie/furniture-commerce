import assert from "node:assert/strict"
import { buildOliverFacadeJsonLd, oliverFacadeMaterialOptions, oliverFacadeVariantTarget, verifiedOliverFacadeConfigurations } from "./oliver-facade-json-ld"
import { selectedOliverFacadeJsonLd } from "./selected-oliver-facade-json-ld"
import { buildProductJsonLd } from "./product-json-ld"

const full = { key: "solid_full", label_ru: "Полностью из массива", price_multiplier: 1, position: 1 }
const mixed = { key: "solid_front_ldsp_body", label_ru: "Фасады из массива + корпус ЛДСП", price_multiplier: 32500 / 34950, price_rub: 32500, position: 0 }
function fixture() {
  return { id: "bedside", handle: "ol-08-1", status: "published", title: "Прикроватная тумба Оливер",
    purchase: { sales_mode: "configurable_to_order", purchase_flow: "cart", can_purchase: true },
    metadata: { buyer_default_configuration: { variant_id: "open", material_execution_code: mixed.key,
      min_unit_price: 32500, material_price_multiplier: mixed.price_multiplier, color_multiplier: 1 } },
    variants: [
      { id: "door", sku: "OL-08-2", calculated_price: { calculated_amount: 39950, currency_code: "rub" },
        metadata: { capabilities: { material_tiers: { solid_full: full } }, gallery_urls: ["/static/door-front.jpg", "/static/door-side.jpg"], source_description: "Версия с дверкой.",
          dimensions: { width_mm: 500, depth_mm: 455, height_mm: 650 },
          variant_axes: { facade: { label: "Исполнение фасада", display: "С дверкой", sort: 1 } } } },
      { id: "open", sku: "OL-08-1", calculated_price: { calculated_amount: 34950, currency_code: "rub" },
        metadata: { capabilities: { material_tiers: { solid_full: full, solid_front_ldsp_body: mixed } },
          gallery_urls: ["/static/open-front.jpg", "/static/open-side.jpg"], source_description: "Версия с открытой нишей.",
          dimensions: { width_mm: 500, depth_mm: 455, height_mm: 650 },
          variant_axes: { facade: { label: "Исполнение фасада", display: "С открытой полкой", sort: 0 } } } },
    ] }
}
const product = fixture()
const before = JSON.stringify(product)
const configs = verifiedOliverFacadeConfigurations(product)!
assert.deepEqual(configs.map(c => [c.sku, c.material.code, c.material.price]), [
  ["OL-08-1", mixed.key, 32500], ["OL-08-1", full.key, 34950], ["OL-08-2", full.key, 39950],
])
assert.equal(oliverFacadeMaterialOptions(configs, "open")?.length, 2)
assert.equal(oliverFacadeMaterialOptions(configs, "door"), null)
const scalar = buildProductJsonLd({ name: "Прикроватная тумба Оливер", sku: "OL-08-1", url: "https://woodright.ru/product/ol-08-1", images: ["/product-static/open-front.jpg"] })
const group = buildOliverFacadeJsonLd(product, configs, scalar)!
const variants = group.hasVariant as Array<Record<string, unknown>>
assert.equal(variants.length, 3)
for (let i = 0; i < variants.length; i++) {
  const item = variants[i], offer = item.offers as Record<string, unknown>
  const c = configs[i], query = new URL(String(item.url)).searchParams
  assert.equal(query.get("variant"), c.variantId); assert.equal(query.get("material"), c.material.code)
  assert.equal(offer.price, c.material.price); assert.equal(offer.availability, "https://schema.org/BackOrder")
  assert.equal(item.sku, c.sku)
  assert.deepEqual(item.image, c.gallery.map(src => new URL(src, String(scalar.url)).href))
}
assert.equal(variants.filter(v => v.sku === "OL-08-2").length, 1, "No invented door+LDSP combination")
assert.equal((selectedOliverFacadeJsonLd(group, "open", full.key)?.offers as Record<string, unknown>).price, 34950)
const selectedDoor = selectedOliverFacadeJsonLd(group, "door", full.key)!
assert.equal(selectedDoor["@type"], "Product")
assert.equal((selectedDoor.offers as Record<string, unknown>).price, 39950)
assert.deepEqual(selectedDoor.image, variants[2].image)
const nestedFamily = selectedDoor.isVariantOf as Record<string, unknown>
assert.equal((nestedFamily.hasVariant as Record<string, unknown>[]).filter(v => v.offers).length, 2)
assert.doesNotThrow(() => JSON.stringify(selectedDoor), "The selected family must have no object cycle")
assert.equal(selectedOliverFacadeJsonLd(group, "door", mixed.key), null, "Stale selection cannot inherit another SKU price")
assert.equal(selectedOliverFacadeJsonLd(group, "open", null), group, "SSR keeps complete source-backed group")
const target = new URL(oliverFacadeVariantTarget(configs, "ol-08-1", "door", { material: mixed.key, motif: "fairies" }), "https://woodright.ru/product/")
assert.equal(target.searchParams.get("material"), null)
assert.equal(target.searchParams.get("motif"), "fairies")
assert.equal(JSON.stringify(product), before, "No metadata, price or SKU mutation")
for (const change of [
  (p: ReturnType<typeof fixture>) => { p.variants[1].calculated_price.currency_code = "usd" },
  (p: ReturnType<typeof fixture>) => { delete (p.variants[0].metadata.capabilities as { material_tiers?: unknown }).material_tiers },
  (p: ReturnType<typeof fixture>) => { p.metadata.buyer_default_configuration.min_unit_price = 1 },
  (p: ReturnType<typeof fixture>) => { p.variants[0].metadata.gallery_urls = ["https://unverified.invalid/photo.jpg"] },
  (p: ReturnType<typeof fixture>) => { p.variants[1].metadata.capabilities.material_tiers.solid_front_ldsp_body!.price_rub = 1 },
]) {
  const changed = structuredClone(fixture()); change(changed)
  assert.equal(verifiedOliverFacadeConfigurations(changed), null)
}
console.log("OL08 facade/material fidelity: three verified configurations, no invented fourth")
