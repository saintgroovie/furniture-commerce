import type { Metadata } from "next"
import { headers } from "next/headers"
import { buildBreadcrumbJsonLd } from "@/lib/product-json-ld"
import { jsonLdHtml } from "@/lib/json-ld"
import { getSiteUrl } from "@/lib/api/base"
import { indexingCanonical } from "@/lib/indexing-policy"
import { seo, wallPanelsCopy } from "@/lib/woodright-copy"
import { HomeRevealObserver } from "@/components/home/home-reveal-observer"
import { WpHero } from "@/components/wall-panels/wp-hero"
import { WpThesis } from "@/components/wall-panels/wp-thesis"
import { WpMaterialExplorer } from "@/components/wall-panels/wp-material-explorer"
import { WpPattern } from "@/components/wall-panels/wp-pattern"
import { WpScale } from "@/components/wall-panels/wp-scale"
import { WpDetails } from "@/components/wall-panels/wp-details"
import { WpInterior } from "@/components/wall-panels/wp-interior"
import { WpSpaces } from "@/components/wall-panels/wp-spaces"
import { WpProcess } from "@/components/wall-panels/wp-process"
import { WpBespokeNav } from "@/components/wall-panels/wp-bespoke-nav"
import { WpFinal } from "@/components/wall-panels/wp-final"

const PATH = "/bespoke/wall-panels"

export function generateMetadata(): Metadata {
  const selfCanonical = indexingCanonical(`${getSiteUrl()}${PATH}`)
  return {
    title: seo.wallPanels.title,
    description: seo.wallPanels.description,
    openGraph: {
      title: seo.wallPanels.title,
      description: seo.wallPanels.description,
      url: PATH,
    },
    ...(selfCanonical ? { alternates: selfCanonical } : {}),
  }
}

/**
 * «По проекту → Стеновые панели». Editorial direction page inside Woodright
 * Bespoke: материал → поверхность → рисунок → масштаб → детали → интерьер →
 * проект. Reuses the `.hp` reveal system and Bespoke theme; adds the `wp-*`
 * editorial layer on top. Visuals are AI art-direction frames (disclosed in
 * the hero), never presented as built objects.
 */
export default async function WallPanelsPage() {
  const cspNonce = (await headers()).get("x-nonce") ?? undefined
  const base = getSiteUrl()
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(base, [
    { name: wallPanelsCopy.breadcrumbs.root, path: "/bespoke" },
    { name: wallPanelsCopy.breadcrumbs.current, path: PATH },
  ])

  return (
    <div className="hp hp--bespoke wp">
      <script
        type="application/ld+json"
        nonce={cspNonce}
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd) }}
      />
      <HomeRevealObserver />
      <WpHero />
      <WpThesis />
      <WpMaterialExplorer />
      <WpPattern />
      <WpScale />
      <WpDetails />
      <WpInterior />
      <WpSpaces />
      <WpProcess />
      <WpBespokeNav />
      <WpFinal />
    </div>
  )
}
