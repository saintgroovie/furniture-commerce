import assert from "node:assert/strict"
import photos from "./prepared-photo-map.json"
import families from "./qualified-native-families.json"
import { qualifiedNativeFamily } from "./qualified-native-family"
import { selectedPreparedPhotoScope, preparedCardPhotoScope, resolvePreparedPhotoURL } from "./prepared-photos"
import { toCatalogBrowseClientProduct } from "./catalog-browse-client-product"

// ONE new case: the actual qualified-family projection retains published status
// while dropping all native image IDs. All mapped replacements were rejected.
const family = families.find(f => f.members.some(member => photos.records.some(row => row.productId === member.productId && row.variantId === member.variantId && row.sku === member.sku && row.slots.every(s => !!s.imageId))))!
const member = family.members.find(member => photos.records.some(row => row.productId === member.productId && row.variantId === member.variantId && row.sku === member.sku && row.slots.every(s => !!s.imageId)))!
const photo = photos.records.find(row => row.productId === member.productId && row.variantId === member.variantId && row.sku === member.sku)!
const product = { id: member.productId, handle: member.handle, status: "published", metadata: { collection: family.collection },
  thumbnail: photo.slots[0].source,
  images: photo.slots.map(slot => ({ id: "rejected-native-id:" + slot.imageId, url: slot.source })),
  variants: [{ id: member.variantId, sku: member.sku }] }
assert(qualifiedNativeFamily(product), "actual qualified family, no synthetic status injection")
assert.equal(selectedPreparedPhotoScope(product, member.variantId), null)
const original = JSON.stringify(product)
const slim = toCatalogBrowseClientProduct(product)
assert.equal(slim.status, "published", "actual projector retains qualified-family status")
assert((slim.images as any[]).every(i => !Object.hasOwn(i, "id")))
assert(Object.hasOwn(slim, "prepared_photo_scope"))
assert.equal(slim.prepared_photo_scope, null)
// The negative marker must survive the actual JSON/hydration boundary.
const hydratedProduct = JSON.parse(JSON.stringify(slim))
assert(Object.hasOwn(hydratedProduct, "prepared_photo_scope"))
const scope = preparedCardPhotoScope(hydratedProduct)
assert.equal(scope, null)
for (const slot of photo.slots) assert.equal(resolvePreparedPhotoURL(scope, slot.source), slot.source)
assert.equal(JSON.stringify(product), original)
// Same fixture with correct native IDs remains a raw-product positive control.
const native = { ...product, images: photo.slots.map(slot => ({ id: slot.imageId, url: slot.source })) }
assert(!Object.hasOwn(native, "prepared_photo_scope"))
assert.equal(preparedCardPhotoScope(native)?.replacements.length, photo.slots.length)
console.log("photo empty projection: actual qualified-family ALL-rejected marker survives JSON; zero overrides; raw control PASS")
