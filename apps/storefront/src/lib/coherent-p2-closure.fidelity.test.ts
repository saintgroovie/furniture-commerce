import assert from "node:assert/strict"
import photos from "./prepared-photo-map.json"
import data from "./card-content-source-data.json"
import { selectedPreparedPhotoScope, preparedCardPhotoScope, resolvePreparedPhotoURL } from "./prepared-photos"
import { toCatalogBrowseClientProduct } from "./catalog-browse-client-product"
import { buildPdpSupplement, type ContentRecord, type SupplementContext } from "./pdp-supplement-core"
import { NEW_CONTENT_GEOMETRY_KEYS } from "./pdp-supplement-geometry"
import { getDimensions, getMattressSize } from "./product-metadata"

// Only the two new review findings; no old catalogue/schema/136-photo suite.
const photo = photos.records.find(row => row.sku === "CO-02-1")!
const rejected = photo.slots[0], accepted = photo.slots[1]
const product = { id: photo.productId, status: "published", thumbnail: rejected.source, metadata: {},
  images: photo.slots.map((s, i) => ({ id: i === 0 ? "changed-native-image-id" : s.imageId, url: s.source })),
  variants: [{ id: photo.variantId, sku: photo.sku }] }
const original = JSON.stringify(product)
const full = selectedPreparedPhotoScope(product, photo.variantId)!
assert.equal(full.replacements.length, 2)
assert.equal(resolvePreparedPhotoURL(full, rejected.source), rejected.source)
assert.equal(resolvePreparedPhotoURL(full, accepted.source), accepted.target)
const slim = toCatalogBrowseClientProduct(product)
assert((slim.images as any[]).every(i => !Object.hasOwn(i, "id")))
for (const projected of [slim, { ...slim, status: "published" }]) {
  const hydrated = preparedCardPhotoScope(projected)!
  assert.equal(hydrated.replacements.length, 2)
  assert.equal(resolvePreparedPhotoURL(hydrated, rejected.source), rejected.source)
  assert.equal(resolvePreparedPhotoURL(hydrated, accepted.source), accepted.target)
  assert.deepEqual(hydrated.replacements, full.replacements)
}
const staleURLs = { ...slim, thumbnail: "/product-static/changed.jpg", images: [] }
assert.equal(preparedCardPhotoScope(staleURLs), null)
assert.equal(JSON.stringify(product), original)

const context: SupplementContext = { routeKey: "review-fixture", productKey: "review-fixture", urlVariantAtRender: null,
  existingLabels: [], nativeBodyShown: false, nativeSleepingShown: false, nativePositionShown: false,
  configurationShown: false, materialControlShown: false, resolvedCollection: null, initialMaterialCode: null, deliveryPolicyText: "" }
const rows = data.rows as unknown as ContentRecord[]
const fixture = (r: ContentRecord) => ({ id: r.product_id, status: "published", metadata: {} as Record<string, any>,
  variants: [{ id: r.variant_id, sku: r.sku, metadata: {} as Record<string, any> }] })
const has = (view: ReturnType<typeof buildPdpSupplement>, label: string) => !!view?.rows.some(row => row.label === label)
const sleeping = rows.find(r => r.content.sleeping_place?.native_source_fields?.some(f => f.native_field === "variant.metadata.variant_axes.mattress_size.display"))!
const sleepRecord = { ...sleeping, content: { sleeping_place: sleeping.content.sleeping_place } }
const sleeper = fixture(sleeping)
sleeper.variants[0].metadata.variant_axes = { mattress_size: { display: sleeping.content.sleeping_place.value.value } }
// Positive: a truly missing structured source may still use the guarded old fact.
assert(has(buildPdpSupplement(sleepRecord, sleeper, sleeping.variant_id, context), "Размер спального места"))
sleeper.variants[0].metadata.mattress_size = { status: "MATTRESS_SIZE_UNKNOWN" }
assert.equal(getMattressSize(sleeper, sleeper.variants[0]), null)
assert(!has(buildPdpSupplement(sleepRecord, sleeper, sleeping.variant_id, context), "Размер спального места"))
// Other explicit malformed bags and the product-level bag also supersede old facts.
sleeper.variants[0].metadata.mattress_size = { width_cm: 90, length_cm: 200, key: "wrong" }
assert.equal(getMattressSize(sleeper, sleeper.variants[0]), null)
assert(!has(buildPdpSupplement(sleepRecord, sleeper, sleeping.variant_id, context), "Размер спального места"))
delete sleeper.variants[0].metadata.mattress_size
sleeper.metadata.mattress_size = { status: "MATTRESS_SIZE_UNKNOWN" }
assert(!has(buildPdpSupplement(sleepRecord, sleeper, sleeping.variant_id, context), "Размер спального места"))

const body = rows.find(r => r.sku === "CO-02-1")!
const bodyRecord = { ...body, content: { body_dimensions: body.content.body_dimensions } }
const cabinet = fixture(body)
cabinet.metadata.dimensions_normalized = body.content.body_dimensions.guards!.source_values_must_match["product.metadata.dimensions_normalized"]
assert(getDimensions(cabinet))
cabinet.variants[0].metadata.dimensions = { axis_states: ["height", "width", "depth"].map(axis => ({ axis, positions: [] })) }
assert.equal(getDimensions(cabinet, cabinet.variants[0]), null)
assert(!has(buildPdpSupplement(bodyRecord, cabinet, body.variant_id, context), "Габариты"))

// One guarded missing-only join proves the retained path, not a replay of all12.
const missing = rows.find(r => NEW_CONTENT_GEOMETRY_KEYS.includes(r.product_id + "|" + r.variant_id + "|" + r.sku))!
const missingRecord = { ...missing, content: { body_dimensions: missing.content.body_dimensions } }
const joined = fixture(missing), guards = missing.content.body_dimensions.guards!.source_values_must_match
joined.metadata.workbook_row_key = guards["product.metadata.workbook_row_key"]
joined.metadata.workbook_product_code = guards["product.metadata.workbook_product_code"]
const joinedContext = { ...context, resolvedCollection: guards.resolved_native_collection }
assert(has(buildPdpSupplement(missingRecord, joined, missing.variant_id, joinedContext), "Габариты"))
joined.variants[0].metadata.dimensions = { axis_states: ["height", "width", "depth"].map(axis => ({ axis, positions: [] })) }
assert(!has(buildPdpSupplement(missingRecord, joined, missing.variant_id, joinedContext), "Габариты"))
console.log("coherent-P2: mixed nativeID slim subset + authoritative withheld measurements + one missing-only positive PASS")
