import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const originalResolve = Module._resolveFilename
Module._resolveFilename = function(specifier, parent, ...rest) {
  return originalResolve.call(this, specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : specifier, parent, ...rest)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText
  module._compile(compiled, filename)
}

async function sourceReviewClosureOnly() {
  const h = require('./qualified-native-family.ts')
  const family = JSON.parse(fs.readFileSync(path.join(__dirname, 'qualified-native-families.json'), 'utf8')).find(row => row.key === 'oliver:bed:five-sizes-footboard')
  const make = handle => { const m = family.members.find(row => row.handle === handle); return {
    id: m.productId, handle: m.handle, title: 'Кровать Оливер без изножья', status: 'published',
    metadata: { collection: family.collection }, variants: [{ id: m.variantId, sku: m.sku }],
    purchase: { can_purchase: true, purchase_flow: 'cart' },
  } }
  const current = make('ol-14-2')
  const rows = h.nativeFamilyChoiceRows(current, [])
  assert.equal(rows.length, 2)
  assert(rows.every(row => row.choices.length === 1 && row.choices[0].isCurrent))
  const { PdpNativeFamilySelectors } = require('../components/pdp-native-family-selectors.tsx')
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const html = renderToStaticMarkup(React.createElement(PdpNativeFamilySelectors, { product: current, members: [] }))
  assert(html.includes('90×190 см') && html.includes('Без изножья'))
  assert(!html.includes('<a'), 'failed sibling read keeps properties and suppresses unavailable links')
  const page = fs.readFileSync(path.join(root, 'app/product/[id]/page.tsx'), 'utf8')
  assert(page.includes('{nativeFamily && (\n                <PdpNativeFamilySelectors'))
  const entries = h.qualifiedNativeDisplayEntries([current, make('ol-15-2')], () => ({ amount: 1000, requestQuoteLabel: null }))
  assert.equal(entries.length, 1)
  assert(entries[0].displayGroup.hint.includes('без изножья'))
  assert(!entries[0].displayGroup.hint.includes('с изножьем и без'))
  const mixed = h.qualifiedNativeDisplayEntries([current, make('ol-14-1')], () => ({ amount: 1000, requestQuoteLabel: null }))
  assert(mixed[0].displayGroup.hint.includes('с изножьем и без'))
  console.log(JSON.stringify({ status: 'PASS_TWO_SOURCE_REVIEW_FINDING_CLOSURES_ONLY', cases: ['actual component static rendering with zero loaded siblings keeps selected90x190/withoutfoot and no foreign links', 'filtered two withoutfoot sizes hint only withoutfoot; both observed footboards retain mixed hint'], old13familyTestsOrValidatorsRepeated: false }))
}

;(async () => {
  if (process.argv.includes("--source-review-closure-only")) { await sourceReviewClosureOnly(); return }
  const h = require('./qualified-native-family.ts')
  const { groupProductsForDisplay } = require('./display-group.ts')
  const { resolveCatalogCardPrice } = require('./catalog-card-price.ts')
  const { toCatalogBrowseClientProducts } = require('./catalog-browse-client-product.ts')
  const { applyCatalogFilters } = require('./catalog-filters.ts')
  const { parseCatalogFilterState } = require('./catalog-filter-params.ts')
  const { presentBuyerCartLine } = require('./product-title-presentation.ts')
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'qualified-native-families.json'), 'utf8'))
  assert.equal(registry.length, 13)
  assert.equal(registry.flatMap(f => f.members).length, 42)
  const all = registry.flatMap(family => family.members.map((member, index) => ({
    id: member.productId, handle: member.handle, status: 'published', title: family.title,
    collection_id: member.collectionId,
    metadata: { collection: ['provence', 'country-london-paris'].includes(family.collection) ? null : family.collection,
      buyer_default_configuration: { variant_id: member.variantId, min_unit_price: 1000 + index * 100 },
      fabric_upholstery_executions: [{ key: 'only-' + member.sku, urls: ['/own/' + member.sku + '.jpg'] }],
    },
    variants: [{ id: member.variantId, sku: member.sku, prices: [{ amount: 1000 + index * 100 }] }],
    thumbnail: '/own/' + member.sku + '.jpg',
    runtimeAmount: 1000 + index * 100,
    purchase: { purchase_flow: 'cart', can_purchase: true, sales_mode: 'made_to_order' },
  })))
  assert(all.every(product => h.qualifiedNativeFamily(product)))
  const oliver = all.filter(p => p.handle.startsWith('ol-') && /^ol-1[4-8]-[12]$/.test(p.handle))
  const current = oliver.find(p => p.handle === 'ol-14-2')
  assert.equal(current.id, 'prod_01KNTBXADFNYAQGPEQKCM4NPZE')
  const rows = h.nativeFamilyChoiceRows(current, oliver)
  assert.equal(rows[0].choices.length, 5)
  assert.equal(rows[1].choices.length, 2)
  assert.equal(rows[1].choices.find(c => !c.isCurrent).href,
    '/product/ol-14-1?variant=variant_01KNTBXBMB9XHDDS7MFKP5TYRE')
  for (const product of all) for (const row of h.nativeFamilyChoiceRows(product, all)) for (const choice of row.choices) {
    const native = all.find(p => p.id === choice.id)
    const url = new URL(choice.href, 'https://woodright.ru')
    assert.equal(url.pathname, '/product/' + native.handle)
    assert.equal(url.searchParams.get('variant'), native.variants[0].id)
    assert(!url.searchParams.has('material'))
    assert(!url.searchParams.has('upholstery'))
  }
  const pvPlain90 = all.find(p => p.handle === 'pv-14-1')
  const pvFabric120 = all.find(p => p.handle === 'pv-15-2')
  assert.equal(h.nativeFamilyChoiceRows(pvPlain90, all).find(r => r.label === 'Изголовье').choices.length, 1)
  assert.equal(h.nativeFamilyChoiceRows(pvFabric120, all).find(r => r.label === 'Размер спального места').choices.length, 2)
  for (const change of [{ id: 'foreign' }, { status: 'draft' }, { handle: 'ol-17-3' }, { collection_id: 'foreign' }, { metadata: { collection: 'other' } }, { variants: [{ ...current.variants[0], id: oliver[0].variants[0].id }] }]) {
    assert.equal(h.qualifiedNativeFamily({ ...current, ...change }), null)
  }
  assert.equal(h.nativeFamilyPriceEligible({ ...current, purchase: { purchase_flow: 'cart', can_purchase: false } }), false)
  const lean = all.map(({ purchase, ...product }) => product)
  assert.equal(h.nativeFamilyPriceEligible(lean[0]), false, 'positive default is not sales-policy evidence')
  let active = 0, peak = 0, reads = 0
  const byId = new Map(all.map(p => [p.id, p]))
  all.find(p => p.handle === 'ol-18-2').runtimeAmount = 350
  const resolver = p => ({ amount: p.runtimeAmount, requestQuoteLabel: null })
  const qualified = await h.qualifyNativeFamilyCatalog(lean, async id => {
    reads++; active++; peak = Math.max(peak, active)
    await new Promise(resolve => setImmediate(resolve))
    active--; return byId.get(id)
  }, resolver)
  assert.equal(reads, 42)
  assert.equal(peak, 3)
  assert(qualified.every(p => h.nativeFamilyPriceProof(p)?.eligible))
  assert(!qualified.some(p => Object.hasOwn(p, 'purchase')), 'full DTO not retained in lean pool')
  assert.equal(h.qualifiedNativeDisplayEntries(qualified, p => ({ amount: h.nativeFamilyPriceProof(p).amount, requestQuoteLabel: null })).length, 13)
  const thin = toCatalogBrowseClientProducts(qualified)
  assert(thin.every(p => h.qualifiedNativeFamily(p)), '42 status/identity survives actual thin projection')
  const entries = groupProductsForDisplay(thin)
  assert.equal(entries.length, 13)
  const entry = entries.find(e => e.displayGroup.familyKey === 'oliver:bed:five-sizes-footboard')
  assert.equal(entry.displayGroup.minPrice, 350)
  assert.equal(entry.product.handle, 'ol-18-2')
  assert.equal(resolveCatalogCardPrice(entry.product, entry.displayGroup).amount, 350)
  const filtered = applyCatalogFilters(thin, parseCatalogFilterState({ q: 'OL-14-' }))
  assert(filtered.length > 0)
  const filteredOliver = groupProductsForDisplay(filtered).find(e => e.displayGroup?.familyKey === 'oliver:bed:five-sizes-footboard')
  assert(filteredOliver && filteredOliver.displayGroup.minPrice > 350, 'filter before family minimum')
  const { catalogItemListJsonLdPayload } = require('./catalog-browse-pool.ts')
  const realisticSingle = thin.map(product => product.handle === 'ol-14-2'
    ? { ...product, title: 'Кровать Оливер без изножья 90×190 см' } : product)
  const exactSku = applyCatalogFilters(realisticSingle, parseCatalogFilterState({ q: 'OL-14-2' }))
  assert.equal(exactSku.length, 1, 'exact native SKU leaves one member')
  const [singleton] = groupProductsForDisplay(exactSku)
  assert.equal(singleton.product, exactSku[0], 'retain the exact filtered native product')
  assert.notEqual(singleton.product.title, 'Кровать Оливер', 'realistic native title exposes the old fallback')
  assert.equal(singleton.displayGroup.title, 'Кровать Оливер', 'same card title as PDP/cart')
  assert.equal(singleton.displayGroup.count, 1)
  assert.equal(singleton.displayGroup.minPrice, null, 'no family minimum from outside the filter')
  assert.deepEqual(resolveCatalogCardPrice(singleton.product, singleton.displayGroup), resolveCatalogCardPrice(exactSku[0]), 'sole native price semantics unchanged')
  const itemList = catalogItemListJsonLdPayload('https://woodright.ru', [singleton])
  assert.equal(itemList.itemListElement[0].name, 'Кровать Оливер')
  assert.equal(new URL(itemList.itemListElement[0].url).pathname, '/product/ol-14-2')
  assert.equal(singleton.product.variants[0].sku, 'OL-14-2')
  const actualCardCaption = h.qualifiedNativeCardChoiceCaption(singleton.product, singleton.displayGroup, 'old native caption')
  assert(actualCardCaption.includes('Размер спального места: 90×190 см'))
  assert(actualCardCaption.includes('Изножье: Без изножья'))
  assert.equal(h.qualifiedNativeCardChoiceCaption(entry.product, entry.displayGroup, 'old native caption'), '', 'multi-family hint unchanged')
  assert.equal(h.qualifiedNativeCardChoiceCaption({}, undefined, 'legacy caption'), 'legacy caption')
  const cardSource = fs.readFileSync(path.join(root, 'components/product-card.tsx'), 'utf8')
  assert(cardSource.includes('const choiceCaption = qualifiedNativeCardChoiceCaption('), 'actual card consumes the tested shared caption helper')

  const partial = await h.qualifyNativeFamilyCatalog(lean, async id => {
    if (id === all.find(p => p.handle === 'ol-18-2').id) throw new Error('mock deadline')
    return byId.get(id)
  }, resolver)
  const partialEntry = groupProductsForDisplay(toCatalogBrowseClientProducts(partial)).find(e => e.displayGroup.familyKey === 'oliver:bed:five-sizes-footboard')
  assert.equal(partialEntry.displayGroup.minPrice, null)
  assert.equal(partialEntry.displayGroup.priceSuppressed, true)
  assert.equal(resolveCatalogCardPrice(partialEntry.product, partialEntry.displayGroup).amount, null)
  const unavailable = await h.qualifyNativeFamilyCatalog(lean, async id => {
    const product = byId.get(id)
    return product.handle === 'ol-18-2' ? { ...product, purchase: { purchase_flow: 'cart', can_purchase: false } } : product
  }, resolver)
  const knownEntry = groupProductsForDisplay(toCatalogBrowseClientProducts(unavailable)).find(e => e.displayGroup.familyKey === 'oliver:bed:five-sizes-footboard')
  assert.equal(knownEntry.displayGroup.minPrice, 1000, 'known ineligible is excluded without a partial/unknown minimum')
  const offers = { '@type': 'Offer', price: 1100, url: 'https://woodright.ru/product/ol-14-2?variant=' + current.variants[0].id, availability: 'https://schema.org/BackOrder' }
  const scalar = { '@type': 'Product', name: 'Кровать Оливер', sku: 'OL-14-2', url: offers.url, image: ['/own/OL-14-2.jpg'], offers, height: { value: 1150 } }
  const schema = h.withQualifiedNativeFamilyJsonLd(current, all, scalar)
  assert.equal(schema.offers, offers)
  assert.equal(schema.image, scalar.image)
  assert.equal(schema.height, scalar.height)
  assert.equal(schema.productID, current.id)
  assert.equal(schema.sku, 'OL-14-2')
  assert.equal(schema.size, '90×190 см')
  assert(schema.additionalProperty.some(p => p.name === 'Изножье' && p.value === 'Без изножья'))
  assert.equal(schema.isVariantOf.hasVariant.length, 10)
  const other = h.withQualifiedNativeFamilyJsonLd(oliver[0], all,
    { ...scalar, sku: 'OL-14-1', url: 'https://woodright.ru/product/ol-14-1' })
  assert.equal(schema.isVariantOf['@id'], other.isVariantOf['@id'])
  assert.equal(schema.isVariantOf.name, 'Кровать Оливер')
  assert.equal(schema.isVariantOf.description, undefined)
  assert.notDeepEqual(current.metadata.fabric_upholstery_executions, oliver[3].metadata.fabric_upholstery_executions)
  const albion = all.filter(p => ['al-14-1', 'al-15-1'].includes(p.handle))
  const albionRows = h.nativeFamilyChoiceRows(albion[0], albion)
  assert.equal(albionRows.length, 1)
  assert.equal(albionRows[0].choices[1].href, '/product/al-15-1?variant=variant_WWC6A9107D26C33C98251BFF')
  for (const product of all) {
    const family = h.qualifiedNativeFamily(product)
    const item = { product_id: product.id, product_handle: product.handle,
      variant_id: product.variants[0].id, variant_sku: product.variants[0].sku,
      title: product.title, unit_price: product.runtimeAmount, quantity: 1 }
    const before = JSON.stringify(item)
    const presented = presentBuyerCartLine(item)
    assert.equal(presented.base_title, family.family.title)
    for (const value of Object.values(family.member.axes)) assert(presented.caption.includes(value))
    assert.equal(JSON.stringify(item), before, 'cart naming must not rewrite line/native identity/price')
    assert.equal(h.qualifiedNativeCartFamily({ ...item, variant_id: 'foreign-variant' }), null)
  }
  const controller = new AbortController()
  let nativeNetworkCalls = 0
  const cancelled = await h.qualifyNativeFamilyCatalog(lean, async id => {
    controller.signal.throwIfAborted()
    nativeNetworkCalls++
    if (nativeNetworkCalls === 3) controller.abort(new Error('mock shared read budget'))
    await new Promise(resolve => setImmediate(resolve))
    controller.signal.throwIfAborted()
    return byId.get(id)
  }, resolver)
  assert.equal(nativeNetworkCalls, 3, 'shared budget starts no more native reads after abort')
  assert(cancelled.every(product => h.nativeFamilyPriceProof(product).state === 'unknown'))
  const cancelledEntries = groupProductsForDisplay(toCatalogBrowseClientProducts(cancelled))
  assert(cancelledEntries.every(entry => entry.displayGroup.priceSuppressed && entry.displayGroup.minPrice === null))
  const unknownIdentity = await h.qualifyNativeFamilyCatalog(lean, async id => ({ ...byId.get(id), id: 'foreign' }), resolver)
  assert(unknownIdentity.every(product => h.nativeFamilyPriceProof(product).state === 'unknown'))
  console.log(JSON.stringify({ status: 'PASS_NEW_13_FAMILY_SEAMS_ONLY', members: 42, families: 13, maxFullNativeConcurrency: peak, fullNativeReadCount: reads,
    coverage: ['exact native routing across42', 'sparse PV combinations', '13 cards after real thin hydration', 'actual eligible minimum and card target', 'FILTERFIRST', 'exact SKU singleton realistic native title keeps card/ItemList family title, actual shared card size/footboard caption and own native price', 'unknown member suppresses FROM', 'cart+can_purchase=false refused', 'perSKU capabilities untouched', 'selected Offer/image/dimensions preserved', 'stable group on old native URLs', 'read-only cart name/axis/native identity across42', 'shared budget abort blocks new reads', 'foreign full DTO unknown/failclosed'],
    noOldTestsOrValidators: true }))
})().catch(error => { console.error(error); process.exitCode = 1 })
