import type { Metadata } from "next"
import { homeCopy, seo } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { getCatalogProducts } from "@/lib/api/products"
import { BESPOKE_PRODUCT_TYPE } from "@/lib/bespoke"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
  isProductInMainCatalogScope,
} from "@/lib/catalog-scope"
import { HomeHero } from "@/components/home/home-hero"
import { HomeEntries } from "@/components/home/home-entries"
import { HomeClassics } from "@/components/home/home-classics"
import { HomeCraft } from "@/components/home/home-craft"
import { HomeKids } from "@/components/home/home-kids"
import { HomeProject } from "@/components/home/home-project"
import { HomeFinal } from "@/components/home/home-final"
import { HomeRevealObserver } from "@/components/home/home-reveal-observer"
import { HomeRoomScene, type HomeScene } from "@/components/home/home-room-scene"
import { pickByHandles, toHomeProduct, type HomeProduct } from "@/components/home/home-data"
import { homeMedia } from "@/components/home/home-media"

export const metadata: Metadata = {
  title: seo.home.title,
  description: seo.home.description,
  openGraph: {
    title: seo.home.title,
    description: seo.home.description,
    url: "/",
  },
}

/** Curated showcase picks; missing handles are skipped, gaps are backfilled. */
const FEATURED_HANDLES = [
  "greenwich-gr-67-1",
  "greenwich-gr-26-1",
  "greenwich-gr-05-1",
  "greenwich-gr-44-1",
  "greenwich-gr-08-1",
]

/** Oliver kids line: milky white with olive-toned handpaint. */
const KIDS_HANDLES = ["ol-85-1", "ol-95-1", "ol-81-1"]

const SCENE_PRODUCT_HANDLES = [
  "greenwich-gr-12-1",
  "greenwich-gr-08-1",
  "greenwich-gr-67-1",
  "greenwich-gr-02-1",
]

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

async function loadHomeShowcase(): Promise<{
  featured: HomeProduct[]
  kids: HomeProduct[]
  sceneProducts: Map<string, HomeProduct>
}> {
  let products: Record<string, unknown>[] = []
  try {
    const res = await getCatalogProducts()
    products = (res.products ?? []) as Record<string, unknown>[]
  } catch {
    // Backend unavailable: the page still renders every section; the
    // product strips are simply hidden (no fake placeholders).
    return { featured: [], kids: [], sceneProducts: new Map() }
  }

  const mainScope = products.filter(
    (p) =>
      isProductInMainCatalogScope(p) &&
      !isMedusaCanonicalSeedDemoProduct(p) &&
      !isBespokeProduct(p) &&
      !KIDS_COLLECTIONS.has(productCollection(p) ?? "")
  )

  const featured = pickByHandles(mainScope, FEATURED_HANDLES)
  if (featured.length < 3) {
    const have = new Set(featured.map((p) => p.id))
    for (const p of mainScope) {
      if (featured.length >= 5) break
      const hp = toHomeProduct(p)
      if (hp && !have.has(hp.id)) {
        featured.push(hp)
        have.add(hp.id)
      }
    }
  }

  const kidsPool = products
    .filter(
      (p) =>
        KIDS_COLLECTIONS.has(productCollection(p) ?? "") &&
        isProductInActiveCatalogScope(p) &&
        !isMedusaCanonicalSeedDemoProduct(p) &&
        !isBespokeProduct(p)
    )
    // Backfill prefers the Oliver kids line (white + olive palette).
    .sort((a, b) => {
      const ak = productCollection(a) === "oliver-kids" ? 0 : 1
      const bk = productCollection(b) === "oliver-kids" ? 0 : 1
      return ak - bk
    })
  let kids = pickByHandles(kidsPool, KIDS_HANDLES)
  if (kids.length < 3) {
    const have = new Set(kids.map((p) => p.id))
    for (const p of kidsPool) {
      if (kids.length >= 3) break
      const hp = toHomeProduct(p)
      if (hp && !have.has(hp.id)) {
        kids.push(hp)
        have.add(hp.id)
      }
    }
  }
  kids = kids.slice(0, 3)

  const sceneProducts = new Map<string, HomeProduct>()
  const byHandle = new Map<string, Record<string, unknown>>()
  for (const p of mainScope) {
    const h = typeof p.handle === "string" ? p.handle : null
    if (h) byHandle.set(h, p)
  }
  for (const handle of SCENE_PRODUCT_HANDLES) {
    const p = byHandle.get(handle)
    if (!p) continue
    const hp = toHomeProduct(p)
    if (hp) sceneProducts.set(handle, hp)
  }

  // Curated finish variants: the featured cards slowly cycle colors.
  // Variant JPGs are mounted client-side after idle (HomeDeferredCardLayers)
  // so they stay off the SSR/LCP critical path. No second Medusa round-trip
  // for hover shots - catalog projection is hero-only and the primary image
  // is enough for first paint.
  for (const p of featured) {
    const variants = p.handle ? homeMedia.featuredVariants[p.handle] : undefined
    if (variants?.length) p.variantImgs = variants
  }

  return { featured, kids, sceneProducts }
}

function buildScenes(sceneProducts: Map<string, HomeProduct>): HomeScene[] {
  const spot = (handle: string, x: number, y: number) => {
    const p = sceneProducts.get(handle)
    if (!p) return null
    return { x, y, title: p.title, price: p.priceLabel, href: p.href }
  }

  const scenes: HomeScene[] = []

  const greenwichSpots = [
    spot("greenwich-gr-12-1", 44, 66),
    spot("greenwich-gr-08-1", 85, 64),
    spot("greenwich-gr-67-1", 27, 50),
  ].filter((s): s is NonNullable<typeof s> => s != null)
  scenes.push({
    id: "greenwich",
    img: homeMedia.roomSceneGreenwich,
    alt: "Светлая спальня Greenwich с кроватью, рабочим столом и тумбой",
    spots: greenwichSpots,
  })

  const cloudSpots = [
    spot("greenwich-gr-67-1", 12, 56),
    spot("greenwich-gr-12-1", 50, 64),
    spot("greenwich-gr-02-1", 88, 42),
  ].filter((s): s is NonNullable<typeof s> => s != null)
  scenes.push({
    id: "cloud",
    img: homeMedia.roomSceneCloud,
    alt: "Спальня Cloud с кроватью, рабочим столом и гардеробом",
    spots: cloudSpots,
  })

  return scenes
}

export default async function HomePage() {
  const { featured, kids, sceneProducts } = await loadHomeShowcase()
  const scenes = buildScenes(sceneProducts)
  const sceneCaption = homeCopy.woodBlock.text[1]

  return (
    <div className="hp">
      <HomeRevealObserver />
      <HomeHero />
      <HomeEntries />
      <HomeClassics featured={featured} />

      <section className="hp-section hp-rooms hp-wrap" aria-label={formatRuInline(sceneCaption)} data-reveal>
        <p className="hp-rooms-caption">{formatRuInline(sceneCaption)}</p>
        <HomeRoomScene scenes={scenes} />
      </section>

      <HomeCraft />
      <HomeKids products={kids} />
      <HomeProject />
      <HomeFinal />
    </div>
  )
}
