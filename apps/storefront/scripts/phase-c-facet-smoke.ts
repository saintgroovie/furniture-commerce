/**
 * Phase C live facet equality vs legacy 4-call composition.
 * Run from apps/storefront with .env.local loaded.
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { getProducts } from "../src/lib/api/products"
import {
  buildAllCatalogFacets,
  buildCatalogFacets,
  type CatalogFilterState,
} from "../src/lib/catalog-filters"
import { parseCatalogFilterState } from "../src/lib/catalog-filter-params"
import {
  fetchKidsRoomSetMembership,
  resolveKidsProducts,
} from "../src/lib/kids"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInMainCatalogScope,
} from "../src/lib/catalog-scope"
import { BESPOKE_PRODUCT_TYPE } from "../src/lib/bespoke"

const OUT = resolve(process.cwd(), "../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const queries = [
  "",
  "category=krovati",
  "collection=oliver",
  "collection=greenwich",
  "sort=price_asc",
  "category=shkafy&collection=oliver",
]

async function main() {
  const [storeData, membership] = await Promise.all([
    getProducts(),
    fetchKidsRoomSetMembership(),
  ])
  const storeProducts = (storeData.products ?? []) as Array<
    Record<string, unknown>
  >
  const kids = await resolveKidsProducts({ storeProducts, membership })
  const scoped = storeProducts.filter((p) => {
    if (kids.ids.has(p.id as string)) return false
    if (!isProductInMainCatalogScope(p)) return false
    if (isMedusaCanonicalSeedDemoProduct(p)) return false
    const c = (
      p.product_classification as { product_type?: string } | undefined
    )?.product_type
    return c !== BESPOKE_PRODUCT_TYPE
  })

  function legacy(state: CatalogFilterState) {
    const categoryFacets = buildCatalogFacets(scoped, state, "category")
    const collectionFacets = buildCatalogFacets(scoped, state, "collection")
    return {
      types: buildCatalogFacets(scoped, state, "type").types,
      categories: categoryFacets.categories,
      collections: collectionFacets.collections,
      categoryAllCount: categoryFacets.categoryAllCount,
      collectionAllCount: collectionFacets.collectionAllCount,
      priceRange: buildCatalogFacets(scoped, state, "price").priceRange,
    }
  }

  const report = []
  for (const q of queries) {
    const sp = Object.fromEntries(new URLSearchParams(q))
    const state = parseCatalogFilterState(sp)
    const a = buildAllCatalogFacets(scoped, state)
    const b = legacy(state)
    const equal = JSON.stringify(a) === JSON.stringify(b)
    report.push({
      q,
      equal,
      types: a.types.length,
      categories: a.categories.length,
      collections: a.collections.length,
      priceRange: a.priceRange,
    })
    if (!equal) {
      console.error("MISMATCH", q)
      process.exit(1)
    }
  }
  writeFileSync(
    resolve(OUT, "phase-c-facet-snapshots.json"),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
  console.log("phase-c live facet equality: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
