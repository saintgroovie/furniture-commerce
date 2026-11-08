import { NEW_CONTENT_GEOMETRY_KEYS } from "./pdp-supplement-geometry"
/** New read-only presentation adapter only; no current catalog or native writes. */
import assert from "node:assert/strict"
import data from "./card-content-source-data.json"
import { buildPdpSupplement, canonicalContentValue, type ContentRecord, type SupplementContext } from "./pdp-supplement-core"
import { supplementalRowsForRoute, supplementalRouteMatches } from "./pdp-supplement-view"
import { CONFIRMED_LEGAL_DEFAULTS } from "./legal/owner-inputs"

const rows = data.rows as unknown as ContentRecord[]
const baseContext: SupplementContext = { routeKey: "fixture", productKey: "fixture", urlVariantAtRender: null,
  existingLabels: [], nativeBodyShown: false, nativeSleepingShown: false, nativePositionShown: false,
  configurationShown: false, materialControlShown: false, resolvedCollection: null, initialMaterialCode: null,
  deliveryPolicyText: CONFIRMED_LEGAL_DEFAULTS.delivery_regions_and_terms ?? "" }
const productFor = (row: ContentRecord) => ({ id: row.product_id, status: "published", metadata: {} as Record<string, any>,
  variants: [{ id: row.variant_id, sku: row.sku, metadata: {} as Record<string, any> }] })
assert.equal(canonicalContentValue({ b: 1, a: { z: 2, a: "текст" } }), '{"a":{"a":"текст","z":2},"b":1}')
const materialRow = rows.find(r => r.sku === "OL-65-2")!
const product = productFor(materialRow)
product.metadata.material_tiers = {
  solid_full: { key: "solid_full", label_ru: "Полностью из массива" },
  solid_front_ldsp_body: { key: "solid_front_ldsp_body", label_ru: "Фасады из массива + корпус ЛДСП" },
}
const view = buildPdpSupplement(materialRow, product, materialRow.variant_id, { ...baseContext, initialMaterialCode: "solid_full" })!
assert(view)
assert.equal(view.materials.solid_full, "Полностью из массива")
assert.equal(supplementalRowsForRoute(view, "fixture", null, "solid_full").find(r => r.label === "Материал")?.value, "Полностью из массива")
assert.equal(supplementalRowsForRoute(view, "fixture", null, "solid_front_ldsp_body").find(r => r.label === "Материал")?.value, "Фасады из массива + корпус ЛДСП")
assert(!supplementalRowsForRoute(view, "fixture", null, "unknown").some(r => r.label === "Материал"))
// Raw URL material values must never expose Object.prototype or an object child.
for (const query of ["__proto__", "constructor", "toString"]) {
  assert(!supplementalRowsForRoute(view, "fixture", null, query).some(r => r.label === "Материал"), query)
  assert.deepEqual(supplementalRowsForRoute({ ...view, rows: [], materials: {} }, "fixture", null, query), [], query + " on empty materials")
}
const invalidOwnValue = { ...view, materials: { broken: {} } as unknown as Record<string, string> }
assert(!supplementalRowsForRoute(invalidOwnValue, "fixture", null, "broken").some(r => r.label === "Материал"))
assert.equal(supplementalRowsForRoute({ ...view, rows: [], materials: { solid_full: "Полностью из массива" } }, "fixture", null, "solid_full")[0]?.value, "Полностью из массива")

assert.deepEqual(supplementalRowsForRoute(view, "fixture", "sibling-variant", "solid_full"), [])
assert.equal(supplementalRouteMatches(view, "other-product", null), false)
assert.equal(buildPdpSupplement(materialRow, product, "wrong-sibling", baseContext), null)
assert.equal(buildPdpSupplement(materialRow, { ...product, id: "retired-parent" }, materialRow.variant_id, baseContext), null)
assert.equal(buildPdpSupplement(materialRow, { ...product, status: "draft" }, materialRow.variant_id, baseContext), null)
assert.equal(buildPdpSupplement(materialRow, { ...product, variants: [{ id: materialRow.variant_id, sku: "WRONG" }] }, materialRow.variant_id, baseContext), null)
const changed = structuredClone(product)
changed.metadata.material_tiers.solid_full.label_ru = "Changed native source"
assert.deepEqual(buildPdpSupplement(materialRow, changed, materialRow.variant_id, baseContext)?.materials, {})
const capability = structuredClone(product)
capability.variants[0].metadata.capabilities = { material_tiers: { solid_full: { key: "solid_full", label_ru: "Different selected capability" } } }
assert.deepEqual(buildPdpSupplement(materialRow, capability, materialRow.variant_id, baseContext)?.materials, {})
assert.deepEqual(buildPdpSupplement(materialRow, product, materialRow.variant_id, { ...baseContext, materialControlShown: true })?.materials, {})
assert.equal(view.deliveryHref, "/delivery")
assert.equal(buildPdpSupplement(materialRow, product, materialRow.variant_id, { ...baseContext, deliveryPolicyText: "Changed policy" })?.deliveryHref ?? null, null)
const geometry = rows.filter(r => NEW_CONTENT_GEOMETRY_KEYS.includes(r.product_id + "|" + r.variant_id + "|" + r.sku))
assert.equal(geometry.length, 12)
for (const row of geometry) {
  const p = productFor(row), guards = row.content.body_dimensions.guards!.source_values_must_match
  p.metadata.workbook_row_key = guards["product.metadata.workbook_row_key"]
  p.metadata.workbook_product_code = guards["product.metadata.workbook_product_code"]
  const ctx = { ...baseContext, resolvedCollection: guards.resolved_native_collection }
  const missingOnly = buildPdpSupplement(row, p, row.variant_id, ctx)!
  assert(missingOnly.rows.some(r => r.label === "Габариты"), row.sku)
  const existing = structuredClone(p); existing.metadata.dimensions = { height_mm: 999, width_mm: 888, depth_mm: 777 }
  assert(!buildPdpSupplement(row, existing, row.variant_id, ctx)?.rows.some(r => r.label === "Габариты"), row.sku)
  const wrongSource = structuredClone(p); wrongSource.metadata.workbook_product_code = "wrong-row"
  assert(!buildPdpSupplement(row, wrongSource, row.variant_id, ctx)?.rows.some(r => r.label === "Габариты"), row.sku)
  const wrongCollection = { ...ctx, resolvedCollection: "other-collection" }
  assert(!buildPdpSupplement(row, p, row.variant_id, wrongCollection)?.rows.some(r => r.label === "Габариты"), row.sku)
}
// Fields with missing source proof stay individually omitted, not replaced by unknown promises.
const held = { ...materialRow, content: { ...materialRow.content, care: { value: "invented" }, assembly: { value: "invented" } } }
const heldView = buildPdpSupplement(held, product, materialRow.variant_id, baseContext)!
assert(!JSON.stringify(heldView).includes("invented"))
const serial = JSON.stringify(view)
assert(serial.length < 4000)
assert(!/native_source_fields|source_value_sha256|fact_id|guard_contract|multiplier|price/.test(serial))
assert.equal(Object.hasOwn(view, "content"), false)

// Four documented partial bundle statements; never a fabricated full packing list.
const suppliedFixtures = [
  {
    "sku": "OL-85-2",
    "description": "Эту кроватку ставят вплотную к родительской кровати, и ребёнок спит рядом, но на своём месте, а матрас входит в комплект.\n\nКорпус кроватки собран из вертикальных реек, между которыми остаются просветы."
  },
  {
    "sku": "OX-14-11",
    "description": "Это увеличенная нижняя кровать для комплекса Оксфорд-1: она встаёт под верхний ярус и добавляет под ним второе спальное место, шире стандартной нижней кровати.\n\nМатрас в комплект кровати не входит, его подбирают отдельно под спальное место."
  },
  {
    "sku": "OX-90-1",
    "description": "Наверху устроено спальное место с ограждением из балясин, а под ним рабочий стол с выдвижной столешницей. Кровать и стол стоят друг над другом в одном комплексе.\n\nНижняя кровать в эту комплектацию не входит."
  },
  {
    "sku": "OX-14-1",
    "description": "Это нижняя кровать для комплекса Оксфорд-1: она встаёт под верхний ярус и добавляет под ним второе спальное место. Для того же комплекса есть увеличенная нижняя кровать, она шире этой.\n\nМатрас в комплект кровати не входит, его подбирают отдельно под спальное место."
  }
]
for (const source of suppliedFixtures) {
  const row = rows.find(r => r.sku === source.sku)!, p = productFor(row)
  const withDescription = { ...p, description: source.description }
  const current = buildPdpSupplement(row, withDescription, row.variant_id, baseContext)!
  assert(current.rows.some(r => r.label === "Входит в комплект" || r.label === "Не входит в комплект"), source.sku)
  const changed = buildPdpSupplement(row, { ...withDescription, description: "changed source" }, row.variant_id, baseContext)!
  assert(!changed.rows.some(r => r.label === "Входит в комплект" || r.label === "Не входит в комплект"), source.sku)
  assert.equal(changed.deliveryHref, "/delivery")
}
const mirror = rows.find(r => r.sku === "MNM-06-1")!, mirrorProduct = productFor(mirror)
mirrorProduct.metadata.height_with_raised_mirror_mm = 1236
const mirrorView = buildPdpSupplement(mirror, mirrorProduct, mirror.variant_id, baseContext)!
assert(mirrorView.rows.some(r => r.label === "Высота с поднятым зеркалом" && r.value === "1236 мм"))
assert(!buildPdpSupplement(mirror, mirrorProduct, mirror.variant_id, { ...baseContext, nativePositionShown: true })?.rows.some(r => r.label === "Высота с поднятым зеркалом"))
const sleeping = rows.find(r => r.content.sleeping_place?.native_source_fields?.some(f => f.native_field === "variant.metadata.variant_axes.mattress_size.display"))!
const sleeper = productFor(sleeping)
sleeper.variants[0].metadata.variant_axes = { mattress_size: { display: sleeping.content.sleeping_place.value.value } }
assert(buildPdpSupplement(sleeping, sleeper, sleeping.variant_id, baseContext)?.rows.some(r => r.label === "Размер спального места"))
assert(!buildPdpSupplement(sleeping, sleeper, sleeping.variant_id, { ...baseContext, nativeSleepingShown: true })?.rows.some(r => r.label === "Размер спального места"))

console.log("pdp-supplement: NEW selected/source/material/12missing-only/held/transport checks PASS")
