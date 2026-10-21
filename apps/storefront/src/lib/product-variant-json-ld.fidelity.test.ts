import assert from "node:assert/strict"
import { buildProductJsonLd } from "./product-json-ld"
import { buildMaterialTierOptions } from "./material-tiers"
import {
  buildMaterialVariantJsonLd, buildSizeVariantJsonLd,
  explicitVariantSize, materialOptionsForUrl, verifiedMaterialOptions,
} from "./product-variant-json-ld"

function bed(handle: string, sku: string, size: string, price: number): Record<string, unknown> {
  return {
    id: `product-${sku}`, status: "published", handle, title: `Кровать (${size})`,
    metadata: { display_group: "bed-sizes", display_group_title: "Кровать", material_tiers: { solid_full: { price_multiplier: 1 } } },
    variants: [{ id: `variant-${sku}`, sku, calculated_price: { calculated_amount: price, currency_code: "rub" } }],
  }
}
const small = bed("small", "BED-120", "120×190", 70300)
const large = bed("large", "BED-140", "140×190", 77300)
function sizeMarkup(product = small, siblings = [large], price = 70300) {
  return buildSizeVariantJsonLd({
    product, siblings, displayedPriceRub: price, requestQuote: false,
    jsonLd: buildProductJsonLd({ name: String(product.title), sku: "BED-120", url: `https://woodright.ru/product/${product.handle}`, images: ["/product-static/new-photo.jpg"] }),
  })
}
const smallLd = sizeMarkup()!
const largeLd = sizeMarkup(large, [small], 77300)!
assert.equal((smallLd.offers as Record<string, unknown>).price, 70300)
assert.equal((largeLd.offers as Record<string, unknown>).price, 77300)
assert.equal(smallLd.size, "120×190")
assert.deepEqual(smallLd.image, ["https://woodright.ru/product-static/new-photo.jpg"])
const smallGroup = smallLd.isVariantOf as Record<string, unknown>
assert.equal(smallGroup["@id"], (largeLd.isVariantOf as Record<string, unknown>)["@id"])
assert.equal("url" in smallGroup || "offers" in smallGroup, false)
assert.equal(sizeMarkup(small, [large], 70000), null)
assert.equal(sizeMarkup(small, [{ ...large, status: "draft" }]), null)
assert.equal(sizeMarkup(small, [{ ...large, title: "Кровать (140×190) с тканью" }]), null)
assert.equal(sizeMarkup(small, [{ ...large, title: "Кровать (120×190)" }]), null)
assert.equal(explicitVariantSize({ title: "Кровать (120×190), (140×190)" }), null)
assert.equal(explicitVariantSize({ title: "Кровать OL-16-1" }), null)

const material = {
  id: "product-MAT", handle: "material", status: "published", title: "Комод",
  metadata: {
    material_tiers: {
      solid_front_ldsp_body: { key: "solid_front_ldsp_body", label_ru: "Фасады из массива + корпус ЛДСП", price_multiplier: .75, position: 0, price_rub: 75000 },
      solid_full: { key: "solid_full", label_ru: "Полностью из массива", price_multiplier: 1, position: 1 },
    },
    buyer_default_configuration: { min_unit_price: 75000, variant_id: "variant-MAT", material_execution_code: "solid_front_ldsp_body", material_price_multiplier: .75, color_multiplier: 1 },
  },
  variants: [{ id: "variant-MAT", sku: "MAT-1", calculated_price: { calculated_amount: 100000, currency_code: "rub" } }],
}
const options = buildMaterialTierOptions(material)!
assert.equal(verifiedMaterialOptions(material, options)?.length, 2)
const reordered = materialOptionsForUrl(options, "solid_full")
assert.equal(reordered[0].price, 100000)
assert.equal(options[0].price, 75000)
assert.equal(materialOptionsForUrl(options, "<script>"), options)
assert.equal(materialOptionsForUrl(options, ["solid_full", "solid_front_ldsp_body"]), options)
const group = buildMaterialVariantJsonLd({
  product: material, options, requestQuote: false,
  jsonLd: buildProductJsonLd({ name: "Комод", sku: "MAT-1", url: "https://woodright.ru/product/material", images: ["/product-static/new-photo.jpg"] }),
})!
assert.equal(group["@type"], "ProductGroup")
assert.deepEqual(group.variesBy, ["https://schema.org/material"])
assert.equal("offers" in group, false)
const variants = group.hasVariant as Array<Record<string, unknown>>
assert.equal(new Set(variants.map((v) => v["@id"])).size, 2)
assert.equal(new Set(variants.map((v) => v.productID)).size, 2)
for (const variant of variants) {
  const code = new URL(String(variant.url)).searchParams.get("material")!
  const selected = materialOptionsForUrl(options, code)[0]
  assert.equal((variant.offers as Record<string, unknown>).price, selected.price)
  assert.equal(variant.material, selected.label)
  assert.equal(variant.sku, "MAT-1")
  assert.deepEqual(variant.image, ["https://woodright.ru/product-static/new-photo.jpg"])
}
assert.equal(JSON.stringify(group).includes("availability"), false)
assert.equal(verifiedMaterialOptions({ ...material, variants: [...material.variants, material.variants[0]] }, options), null)
assert.equal(verifiedMaterialOptions({ ...material, metadata: { ...material.metadata, buyer_default_configuration: { ...material.metadata.buyer_default_configuration, min_unit_price: 74000 } } }, options), null)
assert.equal(verifiedMaterialOptions({ ...material, metadata: { ...material.metadata, material_tiers: { ...material.metadata.material_tiers, unknown: {} } } }, options), null)
assert.equal(buildMaterialVariantJsonLd({ product: material, options, jsonLd: {}, requestQuote: true }), null)
console.log("product-variant-json-ld.fidelity.test.ts: ok")
