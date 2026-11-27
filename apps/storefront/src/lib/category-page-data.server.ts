import "server-only"
import { cache } from "react"
import { getCatalogProducts } from "./api/products"
import { fetchKidsRoomSetMembership, resolveKidsProducts } from "./kids"
import { scopeCatalogBrowsePool } from "./catalog-browse-pool"
import { CATEGORY_PAGES, categoryProducts } from "./category-pages"
export const categoryCatalog = cache(async () => {
  const [catalog, membership] = await Promise.all([getCatalogProducts(), fetchKidsRoomSetMembership()])
  if (!catalog || !Array.isArray(catalog.products)) throw new Error("Category catalog unavailable")
  const products = catalog.products as Record<string, unknown>[]
  const kids = await resolveKidsProducts({ storeProducts: products, membership })
  const ids = Array.from(kids.ids)
  return { main: scopeCatalogBrowsePool(products, "main", ids), kids: scopeCatalogBrowsePool(products, "kids", ids) }
})
export async function categorySitemapEntries(origin: string) {
  const pools = await categoryCatalog()
  return CATEGORY_PAGES.filter(page => categoryProducts(pools[page.scope], page).length > 0)
    .map(page => ({ loc: new URL(page.path, origin).href }))
}
