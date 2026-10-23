import type { Metadata } from "next"
import { seo } from "@/lib/woodright-copy"
import { pageTitle } from "@/lib/page-title"
import { canonicalAlternates } from "@/lib/page-canonical"
import { kidsEditorialScenes } from "@/lib/editorial-scenes"
import { getEditorialProducts } from "@/lib/editorial-shopping-data"
import { KidsEditorialLanding } from "@/components/kids-editorial-landing"

export const metadata: Metadata = {
  title: pageTitle(seo.kids.title),
  description: seo.kids.description,
  openGraph: { title: seo.kids.title, description: seo.kids.description, url: "/kids" },
  ...canonicalAlternates("/kids"),
}

export default async function KidsPage() {
  const handles = Object.values(kidsEditorialScenes).flatMap((scene) => scene.spots.map((spot) => spot.handle))
  const products = await getEditorialProducts(handles)
  return <KidsEditorialLanding products={products} />
}
