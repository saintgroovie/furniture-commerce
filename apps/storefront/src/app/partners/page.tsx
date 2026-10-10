import Link from "next/link"
import type { Metadata } from "next"
import { CopyLines } from "@/components/copy-lines"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { PartnersEditorial } from "@/components/partners/partners-editorial"
import { getPublicPartners } from "@/lib/api/partners"
import { canonicalAlternates } from "@/lib/page-canonical"
import { partnersCopy, seo } from "@/lib/woodright-copy"
import { pageTitle } from "@/lib/page-title"
import "./partners-editorial.css"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: pageTitle(seo.partners.title),
  description: seo.partners.description,
  openGraph: {
    title: seo.partners.title,
    description: seo.partners.description,
    url: "/partners",
  },
  ...canonicalAlternates("/partners"),
}

export default async function PartnersPage() {
  const partners = await getPublicPartners()
  const isEmpty = partners.length === 0
  const heroSrc =
    partners.find((partner) => partner.slug === "bolshoi")?.images[0] ??
    partners.find((partner) => partner.images[0])?.images[0]

  return (
    <EditorialShell theme="partners">
      {heroSrc ? <link rel="preload" as="image" href={heroSrc} fetchPriority="high" /> : null}
      {isEmpty ? (
        <section className="ed-partners-hero ed-partners-hero--empty">
          <div className="ed-partners-hero-copy">
            <p className="ed-eyebrow">Woodright</p>
            <h1>{partnersCopy.h1}</h1>
            <CopyLines className="ed-hero-lead" lines={partnersCopy.statement} />
            <div className="ed-partners-empty">
              <h2>{partnersCopy.emptyTitle}</h2>
              <CopyLines className="ed-body" lines={partnersCopy.emptyBody} />
              <Link href="/designers" className="btn btn-primary">
                {partnersCopy.emptyCta}
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <PartnersEditorial partners={partners} />
      )}
    </EditorialShell>
  )
}
