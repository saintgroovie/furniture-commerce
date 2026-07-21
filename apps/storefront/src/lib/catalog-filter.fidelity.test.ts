/**
 * Narrow catalog filter fidelity tests (no Next runtime).
 * Run: `yarn tsx src/lib/catalog-filter.fidelity.test.ts` from apps/storefront
 *   or: `../backend/node_modules/.bin/tsx src/lib/catalog-filter.fidelity.test.ts`
 */
import assert from "node:assert/strict"
import {
  applyCatalogFilters,
  clearCatalogFilterState,
  getProductCategoryKey,
  hasActiveCatalogFilters,
  type CatalogFilterState,
} from "./catalog-filters"
import {
  buildCatalogHref,
  parseCatalogFilterState,
  serializeCatalogFilterState,
} from "./catalog-filter-params"

function product(
  id: string,
  classification: "STANDARD" | "CONFIGURABLE" | "BESPOKE" | undefined,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    title: id,
    product_classification: classification
      ? { product_type: classification }
      : undefined,
    metadata: {
      collection: "greenwich",
      category_handle: "krovati",
      ...(extras.metadata as object),
    },
    variants: [
      {
        prices: [{ amount: 10000, currency_code: "rub" }],
      },
    ],
    ...extras,
  }
}

const pool = [
  product("std-1", "STANDARD"),
  product("cfg-1", "CONFIGURABLE"),
  product("bsp-1", "BESPOKE"),
  product("std-2", "STANDARD", {
    metadata: { collection: "oliver", category_handle: "shkafy" },
  }),
]

function baseState(
  partial: Partial<CatalogFilterState> = {}
): CatalogFilterState {
  return {
    category: [],
    collection: [],
    ...partial,
  }
}

function ids(products: Record<string, unknown>[]): string[] {
  return products.map((p) => p.id as string).sort()
}

// 1. No classification → full pool (caller may still exclude BESPOKE at page scope)
{
  const out = applyCatalogFilters(pool, baseState())
  assert.deepEqual(ids(out), ["bsp-1", "cfg-1", "std-1", "std-2"])
}

// 2. STANDARD
{
  const out = applyCatalogFilters(pool, baseState({ type: "STANDARD" }))
  assert.deepEqual(ids(out), ["std-1", "std-2"])
}

// 3. CONFIGURABLE
{
  const out = applyCatalogFilters(pool, baseState({ type: "CONFIGURABLE" }))
  assert.deepEqual(ids(out), ["cfg-1"])
}

// 4. BESPOKE → only BESPOKE
{
  const out = applyCatalogFilters(pool, baseState({ type: "BESPOKE" }))
  assert.deepEqual(ids(out), ["bsp-1"])
}

// 5. BESPOKE with no matching products → empty
{
  const nonBespoke = pool.filter((p) => p.id !== "bsp-1")
  const out = applyCatalogFilters(nonBespoke, baseState({ type: "BESPOKE" }))
  assert.deepEqual(out, [])
}

// 6. BESPOKE must not return STANDARD (parse + apply)
{
  const state = parseCatalogFilterState({ type: "BESPOKE" })
  assert.equal(state.type, "BESPOKE")
  const out = applyCatalogFilters(pool, state)
  assert.ok(out.every((p) => (p.product_classification as { product_type: string }).product_type === "BESPOKE"))
  assert.ok(!out.some((p) => p.id === "std-1"))
}

// 7. Other params preserved with BESPOKE
{
  const state = parseCatalogFilterState({
    type: "BESPOKE",
    q: "кровать",
    collection: "greenwich",
    category: "krovati",
    price_min: "1000",
    price_max: "50000",
    sort: "price_asc",
  })
  assert.equal(state.type, "BESPOKE")
  assert.equal(state.q, "кровать")
  assert.deepEqual(state.collection, ["greenwich"])
  assert.deepEqual(state.category, ["krovati"])
  assert.equal(state.priceMin, 1000)
  assert.equal(state.priceMax, 50000)
  assert.equal(state.sort, "price_asc")
  const qs = serializeCatalogFilterState(state)
  assert.equal(qs.get("type"), "BESPOKE")
  assert.equal(qs.get("q"), "кровать")
  assert.equal(qs.get("collection"), "greenwich")
  assert.equal(qs.get("category"), "krovati")
  assert.equal(qs.get("sort"), "price_asc")
}

// 8. Reset classification only (not other filters)
{
  const state = baseState({
    type: "BESPOKE",
    q: "зеркало",
    collection: ["greenwich"],
    priceMin: 1000,
  })
  const clearedType = { ...state, type: undefined }
  assert.equal(clearedType.type, undefined)
  assert.equal(clearedType.q, "зеркало")
  assert.deepEqual(clearedType.collection, ["greenwich"])
  assert.equal(clearedType.priceMin, 1000)
  const href = buildCatalogHref("/catalog", clearedType)
  assert.ok(href.includes("q="))
  assert.ok(decodeURIComponent(href).includes("зеркало") || href.includes("%D0%B7"))
  assert.ok(href.includes("collection=greenwich"))
  assert.ok(!/[?&]type=/.test(href))
  // clearCatalogFilterState clears everything — document that classification-only clear is type:undefined
  const fullClear = clearCatalogFilterState()
  assert.equal(fullClear.type, undefined)
  assert.ok(!hasActiveCatalogFilters(fullClear))
}

// 9. Unknown query value → no active type (no false active state)
{
  const state = parseCatalogFilterState({ type: "NOT_A_CLASSIFICATION" })
  assert.equal(state.type, undefined)
  assert.ok(!hasActiveCatalogFilters(state))
  const legacyUnknown = parseCatalogFilterState({ product_type: "WIDGET" })
  assert.equal(legacyUnknown.type, undefined)
}

// Legacy product_type=BESPOKE parses as BESPOKE (page redirects product_type→type)
{
  const state = parseCatalogFilterState({ product_type: "BESPOKE" })
  assert.equal(state.type, "BESPOKE")
}

// Main-catalog style scope: BESPOKE filter on non-bespoke pool → empty (fail-closed)
{
  const mainScoped = pool.filter((p) => {
    const pt = (p.product_classification as { product_type?: string })?.product_type
    return pt !== "BESPOKE"
  })
  // Bug recreation: if parse dropped BESPOKE, apply would return mainScoped (bad).
  const broken = applyCatalogFilters(mainScoped, baseState({ type: undefined }))
  assert.ok(broken.length >= 2)
  // Fixed: with type BESPOKE on a pool that already excluded BESPOKE → empty
  const fixed = applyCatalogFilters(mainScoped, baseState({ type: "BESPOKE" }))
  assert.deepEqual(fixed, [])
}

// buyer_item_type fallback when category_handle missing
{
  const key = getProductCategoryKey({
    metadata: { buyer_item_type: "pelenalnye-stoleshnicy" },
  })
  assert.equal(key, "pelenalnye-stoleshnicy")
}

console.log("catalog-filter.fidelity.test.ts: all assertions passed")
