import { buildMaterialTierOptions } from "./material-tiers"
import { verifiedMaterialTierCopy } from "./verified-september-catalog"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { provencePriceEvidence, verifiedProvencePrices } from "./verified-september-catalog"
import { buildProvenceFinishJsonLd, verifiedProvenceFinishPrices } from "./provence-finish-json-ld"
import { buildProductJsonLd } from "./product-json-ld"
import { getPrice, priceOfVariant, buyerDefaultConfiguration } from "./format"
import { resolveCatalogCardPrice } from "./catalog-card-price"
import { readUniformRubAmounts } from "./product-json-ld"
import { getDimensions, pdpDimensionCells } from "./product-metadata"

assert.equal(readFileSync(new URL("./verified-september-catalog.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../../../backend/src/lib/verified-september-catalog.ts", import.meta.url), "utf8"))

const source = [
  ["PV-05-2", 66600, 69900], ["PV-06-2", 47300, 47900], ["PV-08-2", 23300, 24500],
  ["PV-09-1", 13600, 14300], ["PV-55-1", 19900, 18400], ["PV-62-1", 82100, 86300],
  ["PV-61-1", 122100, 128200], ["PV-42-2", 47800, 50300], ["PV-65-8", 83000, 87200],
] as const
for (const [sku, white, dark] of source) {
  const handle = sku.toLowerCase()
  assert.equal(verifiedProvencePrices(handle, white)?.wood, dark)
  assert.equal(verifiedProvencePrices(`provence:${sku}`, white)?.cream, white)
  assert.equal(verifiedProvencePrices(handle, white + 1), null, "changed native base must not reuse evidence")
  const product = { id: `prod-${sku}`, handle, status: "published",
    metadata: { workbook_row_key: `provence:${sku}`, finish_metadata_source: "provence_paint_wood_split" },
    variants: [{ id: `variant-${sku}`, sku, calculated_price: { calculated_amount: white, currency_code: "rub" } }],
    purchase: { sales_mode: "configurable_to_order", can_purchase: true, purchase_flow: "cart", requires_configuration: true,
      requires_manager: false, stock_relevant: false },
  }
  const scalar = buildProductJsonLd({ name: "Предмет", sku, url: `https://woodright.ru/product/${handle}`,
    images: ["/cream.jpg"], dimensions: [{ axis: "width", mm: 470 }], offerPriceRub: white })
  const group = buildProvenceFinishJsonLd(product, scalar, [
    { key: "cream", label: "Молочный", mainSrc: "/cream.jpg", extraSrcs: ["/cream-2.jpg"] },
    { key: "wood", label: "Тёмное дерево", mainSrc: "/wood.jpg", extraSrcs: [] },
  ])!
  assert.equal(group["@type"], "ProductGroup")
  const variants = group.hasVariant as Record<string, any>[]
  assert.deepEqual(variants.map((v) => v.offers.price), [white, dark])
  assert.ok(variants.every((v) => v.sku === sku && v.width.value === 470 && v.offers.availability.endsWith("BackOrder")))
  assert.ok(variants[1].url.endsWith("?finish=wood"))
  assert.deepEqual(variants[1].image, ["https://woodright.ru/wood.jpg"])
  assert.equal(variants[1].offers.hasMerchantReturnPolicy["@id"], "https://woodright.ru/returns#return-policy")
  assert.equal(verifiedProvenceFinishPrices({ ...product, variants: [] }), null)
  assert.equal(verifiedProvenceFinishPrices({ ...product, metadata: { ...product.metadata, workbook_row_key: "provence:OTHER" } }), null)
  assert.equal(verifiedProvenceFinishPrices({ ...product, purchase: { ...product.purchase, can_purchase: false } }), null)
}
assert.equal(provencePriceEvidence("OL-65"), null)

const dual = buildProductJsonLd({ name: "Столик", url: "https://woodright.ru/product/pv-06-2",
  dimensions: [{ axis: "height", values_mm: [750, 1150] }, { axis: "width", mm: 1202 }] })
assert.equal(dual.height, undefined)
assert.deepEqual(dual.additionalProperty, [{ "@type": "PropertyValue", name: "Высота", value: "750 / 1150", unitText: "мм" }])

const product = { id: "prod_01KV69A7AKTR1KH8GH90KC8YAJ", handle: "av-05-1",
  metadata: { workbook_row_key: "ВВ:21", workbook_product_code: "WW-05-1" } }
assert.deepEqual(getDimensions(product), { height_mm: 900, width_mm: 840, depth_mm: 440 })
assert.equal(getDimensions({ ...product, id: "other" }), null)
assert.equal(getDimensions({ ...product, handle: "pa-05-3" }), null, "ambiguous 560 mm body stays unfilled")
assert.equal(getDimensions({ ...product, metadata: { ...product.metadata, dimensions: { height_mm: 123 } } })?.height_mm, 123)
assert.equal(pdpDimensionCells(getDimensions(product)!).length, 3)
console.log("september-configurations.fidelity.test.ts: ok")

for (const [id, sku, base, expected] of [["variant_01KV69A7H4QG73VV860W96G182", "av-05-1", 83820, 87780], ["variant_01KV69A7H410GASW313SSMWF4E", "ba-05-3", 113080, 124300], ["variant_01KV69A7H6QSCESM5YZW3FBVRT", "in-67-1", 85250, 85250], ["variant_01KV69A7H5G52SZGAW6YR5PK7T", "fa-06-1", 59730, 62700], ["variant_01KV69A7H6T0M8VR6SH10PKG79", "fk-05-1", 83820, 87780], ["variant_01KV69A7H8R6FSAA3JGFT02PMK", "rl-67-1", 85250, 85250], ["variant_01KV69A7H5CMMHYFNHKXQJWE5N", "fa-67-1", 85250, 85250], ["variant_01KV69A7H8D09CRXQG8HQ1DDN5", "rl-05-3", 113080, 113080], ["variant_01KV69A7H75NQCJC0A66PE0PR5", "mo-81-1", 22660, 22660], ["variant_01KV69A7H7GT4WF22X1ZWBH0SZ", "pa-05-1", 83820, 96360], ["variant_01KV69A7H48XE5C7YE56RBRDKP", "ba-62-1", 99390, 100320], ["variant_01KV69A7HAR5G3HAQ2M1CYR2VM", "te-05-3", 113080, 124300], ["variant_01KV69A7H9NA9PDPJBT2H5P929", "tb-67-1", 85250, 85250], ["variant_01KV69A7H8QXV0PCF7SHYJRQ1M", "sh-81-1", 22660, 22660]] as const) {
  const variant = { id, sku, calculated_price: { calculated_amount: base, currency_code: "rub" } }
  const product = { variants: [variant], metadata: { buyer_default_configuration: { variant_id: id, min_unit_price: base } } }
  assert.equal(priceOfVariant(variant), expected)
  assert.equal(getPrice(product), expected)
  assert.equal(buyerDefaultConfiguration(product).minUnitPrice, expected)
  assert.equal(resolveCatalogCardPrice(product).amount, expected)
  assert.deepEqual(readUniformRubAmounts(product), [expected])
  assert.equal(priceOfVariant({ ...variant, id: "other" }), base)
}

for (const [legacy, full, ldsp] of [["MN-05-2", 98670, 75800], ["MN-08-1", 27060, 22900], ["MN-61-1", 167090, 125450]] as const) {
  const metadata = { collection: "monchelsea", woodright_recovery: { legacy_code: legacy }, material_tiers: {
    solid_full: { key: "solid_full", label_ru: "Массив", price_rub: full, price_multiplier: 1, position: 1 },
    solid_front_ldsp_body: { key: "solid_front_ldsp_body", label_ru: "Фасады из массива + корпус ЛДСП", description_ru: "Массив", price_rub: ldsp, price_multiplier: ldsp / full, position: 0 },
  } }
  const options = buildMaterialTierOptions({ metadata }, full)!
  assert.equal(options[0].label, "ЛДСП + МДФ")
  assert.equal(options[0].description, null)
  assert.equal(options[0].price, ldsp)
  assert.equal(options[1].label, "Массив")
  assert.equal(verifiedMaterialTierCopy({ ...metadata, collection: "other" }, "solid_front_ldsp_body"), null)
  assert.equal(verifiedMaterialTierCopy({ ...metadata, woodright_recovery: { legacy_code: "MN-OTHER" } }, "solid_front_ldsp_body"), null)
  assert.equal(verifiedMaterialTierCopy({ ...metadata, material_tiers: { ...metadata.material_tiers, solid_full: { ...metadata.material_tiers.solid_full, price_rub: full + 1 } } }, "solid_front_ldsp_body"), null)
}
