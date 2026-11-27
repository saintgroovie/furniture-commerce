import Link from "next/link"
import { nonemptyCategoryPages, type CategoryScope } from "@/lib/category-pages"
export function CategoryLinks({ scope, products }: { scope: CategoryScope; products: Record<string, unknown>[] }) {
  const pages = nonemptyCategoryPages(scope, products)
  if (!pages.length) return null
  return <nav aria-label="Категории каталога" className="nav-links">{pages.map(page => <Link key={page.path} href={page.path}>{page.h1.replace(" Woodright", "").replace("Детские кровати", "Кровати")}</Link>)}</nav>
}
