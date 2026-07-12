import type { Metadata } from "next"
import { seo } from "@/lib/woodright-copy"
import { getCatalogProducts } from "@/lib/api/products"
import { BESPOKE_PRODUCT_TYPE } from "@/lib/bespoke"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
} from "@/lib/catalog-scope"
import { KidsHero } from "@/components/home/kids-hero"
import { KidsEntries } from "@/components/home/kids-entries"
import { KidsPaint } from "@/components/home/kids-paint"
import { KidsStrip } from "@/components/home/kids-strip"
import { KidsFinal } from "@/components/home/kids-final"
import { HomeRevealObserver } from "@/components/home/home-reveal-observer"
import { pickByHandles, toHomeProduct, type HomeProduct } from "@/components/home/home-data"
import { loadHoverImages } from "@/components/home/home-hover-images"
import { kidsMedia } from "@/components/home/kids-media"

export const metadata: Metadata = {
  title: seo.kids.title,
  description: seo.kids.description,
  openGraph: {
    title: seo.kids.title,
    description: seo.kids.description,
    url: "/kids",
  },
}

/** Oliver Kids first (white + olive palette), backfilled from the kids pool. */
const STRIP_HANDLES = ["ol-95-1", "ol-85-1", "ol-81-1", "ol-82-1", "ol-85-2"]

const KIDS_COLLECTIONS = new Set(["willie-winkie", "oliver-kids"])

function productCollection(p: Record<string, unknown>): string | null {
  const md = p.metadata as Record<string, unknown> | undefined
  const c = md?.collection
  return typeof c === "string" ? c : null
}

function isBespokeProduct(p: Record<string, unknown>): boolean {
  const classification = (
    p.product_classification as { product_type?: string } | undefined
  )?.product_type
  return classification === BESPOKE_PRODUCT_TYPE
}

async function loadKidsShowcase(): Promise<{
  strip: HomeProduct[]
  paintHrefs: Map<string, string>
}> {
  let products: Record<string, unknown>[] = []
  try {
    const res = await getCatalogProducts()
    products = (res.products ?? []) as Record<string, unknown>[]
  } catch {
    // Backend unavailable: the page still renders; the strip is hidden and
    // paint crops fall back to the kids catalog link.
    return { strip: [], paintHrefs: new Map() }
  }

  const pool = products.filter(
    (p) =>
      KIDS_COLLECTIONS.has(productCollection(p) ?? "") &&
      isProductInActiveCatalogScope(p) &&
      !isMedusaCanonicalSeedDemoProduct(p) &&
      !isBespokeProduct(p)
  )

  const strip = pickByHandles(pool, STRIP_HANDLES)
  if (strip.length < 3) {
    const have = new Set(strip.map((p) => p.id))
    for (const p of pool) {
      if (strip.length >= 5) break
      const hp = toHomeProduct(p)
      if (hp && !have.has(hp.id)) {
        strip.push(hp)
        have.add(hp.id)
      }
    }
  }

  const hoverImages = await loadHoverImages(strip.map((p) => p.id))
  for (const p of strip) {
    const hover = hoverImages.get(p.id)
    if (hover && hover !== p.img) p.hoverImg = hover
    const variants = p.handle ? kidsMedia.stripVariants[p.handle] : undefined
    if (variants?.length) p.variantImgs = variants
  }

  const paintHrefs = new Map<string, string>()
  const paintHandles = new Set<string>(kidsMedia.paint.map((item) => item.handle))
  for (const p of pool) {
    const h = typeof p.handle === "string" ? p.handle : null
    const id = typeof p.id === "string" ? p.id : null
    if (h && id && paintHandles.has(h)) paintHrefs.set(h, `/product/${id}`)
  }

  return { strip, paintHrefs }
}

export default async function KidsPage() {
  const { strip, paintHrefs } = await loadKidsShowcase()

  return (
    <div className="hp hp--kids">
      <HomeRevealObserver />
      <KidsHero />
      <KidsEntries />
      <KidsPaint hrefByHandle={paintHrefs} />
      <KidsStrip products={strip} />
      <KidsFinal />
    </div>
  )
}
