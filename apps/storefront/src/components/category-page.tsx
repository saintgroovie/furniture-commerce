import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ProductCard } from "@/components/product-card"
import { CatalogFilterControls } from "@/components/catalog-filter-controls"
import { categoryPage, categoryProducts, categoryQuery, type CategoryScope } from "@/lib/category-pages"
import { categoryCatalog } from "@/lib/category-page-data.server"
import { applyCatalogFilters, buildAllCatalogFacets, sortDisplayEntries } from "@/lib/catalog-filters"
import { groupProductsForDisplay } from "@/lib/display-group"
import { catalogCardAtfFlags } from "@/lib/catalog-atf"
import { indexingRobotsMetadata } from "@/lib/indexing-policy"
import { canonicalAlternates } from "@/lib/page-canonical"
import { pageTitle } from "@/lib/page-title"
import type { CatalogSearchParams } from "@/lib/catalog-filter-params"
export type CategoryRouteProps = { params: Promise<{ categorySlug: string }>; searchParams: Promise<CatalogSearchParams> }
async function resolve(scope: CategoryScope, props: CategoryRouteProps) {
  const { categorySlug } = await props.params
  const page = categoryPage(scope, categorySlug)
  if (!page) notFound()
  const pools = await categoryCatalog()
  return { page, products: categoryProducts(pools[scope], page) }
}
export async function categoryMetadata(scope: CategoryScope, props: CategoryRouteProps): Promise<Metadata> {
  const { page, products } = await resolve(scope, props)
  return { title: pageTitle(page.title), description: page.description, ...canonicalAlternates(page.path),
    robots: products.length ? indexingRobotsMetadata() : { index: false, follow: false },
    openGraph: { title: page.title, description: page.description, url: page.path } }
}
export async function CategoryPageView({ scope, props }: { scope: CategoryScope; props: CategoryRouteProps }) {
  const { page, products } = await resolve(scope, props)
  const state = categoryQuery(page, await props.searchParams)
  const entries = sortDisplayEntries(groupProductsForDisplay(applyCatalogFilters(products, state)), state.sort)
  const facets = buildAllCatalogFacets(products, state)
  const parent = scope === "kids" ? "/kids/catalog" : "/catalog"
  return <div data-state={entries.length ? "success" : "empty"}>
    <nav aria-label="Хлебные крошки" className="nav-links"><Link href="/">Главная</Link>{scope === "kids" && <Link href="/kids">Детская</Link>}<Link href={parent}>Каталог</Link><span aria-current="page">{page.h1}</span></nav>
    <div className="catalog-hero"><h1>{page.h1}</h1><p className="info-text">{page.intro}</p>
      <div className="nav-links"><a href="#category-products">{page.main_cta}</a><Link href="/contacts">{page.secondary_cta}</Link></div>
    </div>
    <div id="category-products"><CatalogFilterControls basePath={page.path} state={state} facets={facets} resultCount={entries.length}>
      {entries.length ? <ul className="product-grid catalog-product-grid">{entries.map((entry, index) => <li key={String(entry.product.id)}><ProductCard product={entry.product as never} displayGroup={entry.displayGroup} {...catalogCardAtfFlags(index)} /></li>)}</ul>
        : <div className="status-message"><p>{products.length ? "По выбранным фильтрам товаров не найдено" : "В этой категории пока нет товаров"}</p><Link href={page.path}>Сбросить фильтры</Link></div>}
    </CatalogFilterControls></div>
    <nav aria-label="Информация о выборе" className="nav-links">{page.internal_links.map(href => <Link key={href} href={href}>{href === "/contacts" ? "Контакты" : href === "/delivery" ? "Доставка" : href === "/about/materials" ? "Материалы" : "Каталог"}</Link>)}</nav>
  </div>
}
