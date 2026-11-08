import assert from "node:assert/strict"
import data from "./prepared-photo-map.json"
import { selectedPreparedPhotoScope, preparedCardPhotoScope, resolvePreparedPhotoURL, preparedPhotoSourceKey, preparedPhotoFallbackSource, canFallbackPreparedPhoto, preparedPdpScopeForRoute } from "./prepared-photos"
import { toCatalogBrowseClientProduct } from "./catalog-browse-client-product"
import { galleryAssetStemKey } from "./product-images"
import { extractColorTokenFromUrl, extractMaterialTokenFromUrl, extractExecutionTokenFromUrl } from "./card-color-media"
import { filterExtrasBySuccessfulImageLoad } from "./client/extra-image-url-verify"

async function newPhotoChecks() {
  const record = data.records.find(row => row.slots.every(slot => !!slot.imageId))!
  const slot = record.slots[0]
  // Contract fixture carries current public identity+preimage, not a live capture.
  const product = { id: record.productId, status: "published", handle: "fixture-photo",
    thumbnail: slot.source, metadata: {}, images: record.slots.map(s => ({ id: s.imageId, url: s.source })),
    variants: [{ id: record.variantId, sku: record.sku }] }
  const before = JSON.stringify(product), originalOrder = product.images.map(i => i.url)
  const scope = selectedPreparedPhotoScope(product, record.variantId)!
  assert(scope)
  assert.equal(resolvePreparedPhotoURL(scope, slot.source), slot.target)
  const derivative = slot.source.replace(/\/([^/]+)\.(jpe?g|png)$/i, "/derivatives/card/$1.webp")
  assert.equal(resolvePreparedPhotoURL(scope, derivative, slot.source), slot.target)
  assert.equal(resolvePreparedPhotoURL(scope, derivative), derivative)
  assert.equal(resolvePreparedPhotoURL(scope, derivative, "/product-static/other/wrong.jpg"), derivative)
  assert.equal(resolvePreparedPhotoURL(scope, "https://evil.example" + derivative, slot.source), "https://evil.example" + derivative)

  assert.equal(resolvePreparedPhotoURL(scope, "https://woodright.ru" + slot.source), slot.target)
  assert.equal(resolvePreparedPhotoURL(scope, slot.source.replace("/product-static/", "/static/")), slot.target)
  assert.equal(selectedPreparedPhotoScope({ ...product, id: "wrong-product" }, record.variantId), null)
  assert.equal(selectedPreparedPhotoScope(product, "wrong-variant"), null)
  assert.equal(selectedPreparedPhotoScope({ ...product, variants: [{ id: record.variantId, sku: "wrong-SKU" }] }, record.variantId), null)
  assert.equal(selectedPreparedPhotoScope({ ...product, status: "draft" }, record.variantId), null)
  const wrongURL = { ...product, thumbnail: "/product-static/products/changed.jpg", images: [{ id: slot.imageId, url: "/product-static/products/changed.jpg" }] }
  assert.equal(selectedPreparedPhotoScope(wrongURL, record.variantId), null)
  const wrongID = { ...product, images: product.images.map(i => ({ ...i, id: "changed-native-image-id" })) }
  assert.equal(selectedPreparedPhotoScope(wrongID, record.variantId), null)
  for (const input of ["https://evil.example" + slot.source, "https://user:pass@woodright.ru" + slot.source, slot.source + "?other=1", slot.source + "#other", "/product-static/products/unknown.jpg"]) {
    assert.equal(resolvePreparedPhotoURL(scope, input), input)
  }
  assert.equal(preparedPhotoSourceKey("__proto__"), null)
  assert.equal(JSON.stringify(product), before)
  assert.deepEqual(product.images.map(i => i.url), originalOrder)

  // Existing public DTO drops image IDs/status; its selected marker is generated
  // from public raw data, rechecked against actual identity and current slim URLs.
  const slim = toCatalogBrowseClientProduct(product)
  const hydrated = preparedCardPhotoScope(slim)!
  assert.equal(resolvePreparedPhotoURL(hydrated, slot.source), slot.target)
  assert.equal(resolvePreparedPhotoURL(preparedCardPhotoScope(product), slot.source), slot.target)
  assert.equal(preparedCardPhotoScope({ ...slim, variants: [{ id: "wrong-variant", sku: record.sku }] }), null)
  assert.equal(preparedCardPhotoScope({ ...slim, id: "other-parent" }), null)
  assert.equal(preparedCardPhotoScope({ ...product, status: undefined }), null)
  const draft = toCatalogBrowseClientProduct({ ...product, status: "draft" })
  assert.equal(preparedCardPhotoScope(draft), null)
  const noOpening = { ...product, variants: [...product.variants, { id: "second", sku: "SECOND" }] }
  assert.equal(preparedCardPhotoScope(noOpening), null)

  assert.equal(preparedPdpScopeForRoute(scope, "fixture-photo", record.variantId, "fixture-photo", record.variantId), scope)
  assert.equal(preparedPdpScopeForRoute(scope, "fixture-photo", record.variantId, "fixture-photo", "sibling"), null)
  assert.equal(preparedPdpScopeForRoute(scope, "fixture-photo", record.variantId, "other", record.variantId), null)
  assert.equal(preparedPhotoFallbackSource(slot.source, slot.target, null), slot.target)
  assert.equal(canFallbackPreparedPhoto(slot.source, slot.target, null), true)
  assert.equal(preparedPhotoFallbackSource(slot.source, slot.target, slot.target), slot.source)
  assert.equal(canFallbackPreparedPhoto(slot.source, slot.target, slot.target), false)

  // All 136 NEW URI mappings preserve existing basename stem/execution tokens.
  // Gallery selection/dedup state itself is kept on the original URLs.
  let mappings = 0
  for (const row of data.records) for (const pair of row.slots) {
    assert.equal(galleryAssetStemKey(pair.source), galleryAssetStemKey(pair.target))
    assert.equal(extractColorTokenFromUrl(pair.source), extractColorTokenFromUrl(pair.target))
    assert.equal(extractMaterialTokenFromUrl(pair.source), extractMaterialTokenFromUrl(pair.target))
    assert.equal(extractExecutionTokenFromUrl(pair.source), extractExecutionTokenFromUrl(pair.target))
    mappings++
  }
  assert.equal(mappings, 136)
  assert(!JSON.stringify(data).includes("/Users/"))
  assert(!/saved_page|same_frame_proof|evidence\/|archive_member|yandex/i.test(JSON.stringify(data)))

  const ol65 = { ...product, id: "prod_01KNTBXADW0MYZ9SEBBAYPS5V4", variants: [{ id: "variant_01KY5SEYMYFBSA6FTYH9J8B3ZR", sku: "OL-65-2" }] }
  assert.equal(selectedPreparedPhotoScope(ol65, ol65.variants[0].id), null)
  assert.equal(resolvePreparedPhotoURL({ ...scope, productId: ol65.id }, slot.source), slot.source)

  const gr14 = {"parent": "prod_01KM1QHNHZ1A4J48K4CV10F4FM", "variant": "variant_01KM1QHQ6791A8ZTF6SA4W47C6", "committed": ["/static/imports/WR-PFW-20260721T020528Z/1db9718a83f5282423920ffb18baf5b791396f7aa4c25c9e417dbfd8efd07b2f.jpg", "/static/imports/WR-PFW-20260721T020528Z/e2140838f7245beda65bda6a5d444303a868fd4f8b140e40a3496b41492c6a96.webp", "/static/imports/WR-PFW-20260721T020528Z/78776d4ce740e26aee20e44d8929a8733e88264de01b94398eb943d8ab20277b.jpg", "/static/imports/WR-PFW-20260721T020528Z/a7c7f0d65d0e5fef266a562a10e127e54e1522975d4f8c23a85e8cab0baa153a.jpg", "/static/imports/WR-PFW-20260721T020528Z/2cd4076aaebd612e5b0c79ef6cdd0b77a571b1a5d4863a73ce7fc7f43065fd4b.jpg", "/static/imports/WR-PFW-20260721T020528Z/89991c7c6b5248117619baa6383efa5fc28a8351e01c515fa6cc6e1d032ea5dd.jpg", "/static/imports/WR-PFW-20260721T020528Z/2f828887ab8f3e0ab38c2fc142d1cc765ed40ad503ef3976ed8a84ec18bd2d8a.jpg", "/static/imports/WR-PFW-20260721T020528Z/b4a00faff9c8217b9e49533b4b860e90be79bb94613c42e69d109e52a75b9d0a.jpg"], "saved": ["https://woodright.ru/product-static/products/greenwich/beds-shared/GR-BED-POOL_frame_greenwich_frame_natural_beige.jpg", "https://woodright.ru/product-static/products/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View01.jpg", "https://woodright.ru/product-static/products/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View04.jpg"]}
  const currentGR14 = { id: gr14.parent, status: "published", images: [], metadata: {}, variants: [{ id: gr14.variant, sku: "GR-14-1", metadata: { gallery_urls: gr14.committed } }] }
  const currentBefore = JSON.stringify(currentGR14)
  assert.equal(currentGR14.variants[0].metadata.gallery_urls.length, 8)
  const heldScope = selectedPreparedPhotoScope(currentGR14, gr14.variant)
  assert.equal(heldScope, null)
  for (const old of gr14.saved) assert.equal(resolvePreparedPhotoURL(heldScope, old), old)
  assert.equal(JSON.stringify(currentGR14), currentBefore)

  // Fake Image only: one original fallback, same existing timeout/cap and
  // original return keys; no real browser/network/runtime is started.
  const oldImage = (globalThis as any).Image
  const attempts: string[] = []
  class FakeImage {
    onload: (() => void) | null = null; onerror: (() => void) | null = null
    set src(value: string) { attempts.push(value); queueMicrotask(() => value === slot.target ? this.onerror?.() : this.onload?.()) }
  }
  try {
    ;(globalThis as any).Image = FakeImage
    assert.deepEqual(await filterExtrasBySuccessfulImageLoad([slot.source], 1, url => resolvePreparedPhotoURL(scope, url)), [slot.source])
    assert.deepEqual(attempts, [slot.target, slot.source])
  } finally { (globalThis as any).Image = oldImage }
  console.log("prepared-photos: NEW mapping/identity/preimage/DTO/136classifiers/holds/fallback checks PASS")
}
newPhotoChecks().catch(error => { console.error(error); process.exitCode = 1 })
