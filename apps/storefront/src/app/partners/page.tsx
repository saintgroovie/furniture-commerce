import Link from "next/link"
import type { Metadata } from "next"
import { CopyLines } from "@/components/copy-lines"
import { EditorialFigure } from "@/components/editorial/editorial-figure"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { PartnerIndex } from "@/components/partners/partner-index"
import { getPublicPartners } from "@/lib/api/partners"
import { editorialMedia } from "@/lib/editorial-media"
import { partnersCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.partners.title,
  description: seo.partners.description,
  openGraph: {
    title: seo.partners.title,
    description: seo.partners.description,
    url: "/partners",
  },
}

export default async function PartnersPage() {
  const partners = await getPublicPartners()

  return (
    <EditorialShell theme="partners">
      <section className={partners.length === 0 ? "ed-partners-hero ed-partners-hero--empty" : "ed-partners-hero"}>
        <div className="ed-partners-hero-copy">
          <p className="ed-eyebrow">Woodright</p>
          <h1>{partnersCopy.h1}</h1>
          <CopyLines className="ed-hero-lead" lines={partnersCopy.statement} />
          {partners.length === 0 ? (
            <div className="ed-partners-empty">
              <h2>{partnersCopy.emptyTitle}</h2>
              <CopyLines className="ed-body" lines={partnersCopy.emptyBody} />
              <Link href="/designers" className="btn btn-primary">
                {partnersCopy.emptyCta}
              </Link>
            </div>
          ) : null}
        </div>
        <EditorialFigure
          className="ed-partners-hero-media"
          src={editorialMedia.partnersAtmosphere.src}
          alt={editorialMedia.partnersAtmosphere.alt}
        />
      </section>

      <ul className="ed-partners-strip" data-reveal aria-hidden="true">
        {editorialMedia.partnersStrip.map((item) => (
          <li key={item.src}>
            <img src={item.src} alt="" />
          </li>
        ))}
      </ul>

      {partners.length > 0 ? <PartnerIndex partners={partners} /> : null}
    </EditorialShell>
  )
}
