import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { EditorialFigure } from "@/components/editorial/editorial-figure"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { PartnerMark, hasPartnerMark } from "@/components/partners/partner-mark"
import { getPublicPartnerBySlug } from "@/lib/api/partners"
import { formatRuInline } from "@/lib/format-ru-copy"
import { partnersCopy, seo } from "@/lib/woodright-copy"

export const dynamic = "force-dynamic"

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const partner = await getPublicPartnerBySlug(slug)
  if (!partner) {
    return { title: seo.partners.title }
  }
  return {
    title: `${partner.name} - ${seo.partners.title}`,
    description: partner.description || seo.partners.description,
    openGraph: {
      title: partner.name,
      description: partner.description || seo.partners.description,
      url: `/partners/${partner.slug}`,
    },
  }
}

export default async function PartnerPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const partner = await getPublicPartnerBySlug(slug)
  if (!partner) notFound()

  return (
    <EditorialShell theme="partners">
      <article className="ed-partner-detail ed-wrap">
        <p className="ed-eyebrow">
          <Link href="/partners">{partnersCopy.backToIndex}</Link>
        </p>
        {partner.logo_url ? (
          <img className="ed-partner-logo" src={partner.logo_url} alt="" />
        ) : hasPartnerMark(partner.slug) ? (
          <div className="ed-partner-logo-mark">
            <PartnerMark slug={partner.slug} name={partner.name} />
          </div>
        ) : null}
        <h1>{partner.name}</h1>
        {partner.description ? <p className="ed-body">{formatRuInline(partner.description)}</p> : null}
        {partner.presentations[0] ? (
          <p className="ed-partner-lead-cta">
            <Link
              href={`/partners/${partner.slug}/presentations/${partner.presentations[0].id}`}
              className="btn btn-primary"
            >
              {partnersCopy.viewPresentation}
            </Link>
          </p>
        ) : null}
        {partner.website_url ? (
          <p>
            <a
              href={partner.website_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${partnersCopy.website}: ${partner.name}`}
            >
              {partnersCopy.website}
            </a>
          </p>
        ) : null}

        {partner.images.length > 0 ? (
          <section className="ed-partner-gallery" aria-label={partnersCopy.materialsTitle}>
            {partner.images.map((src, index) => (
              <EditorialFigure
                key={src}
                src={src}
                alt={`${partner.name}, ${index + 1}`}
              />
            ))}
          </section>
        ) : null}

        {partner.presentations.length > 0 ? (
          <section className="ed-presentations" aria-labelledby="partner-presentations">
            <h2 id="partner-presentations">{partnersCopy.presentationsTitle}</h2>
            <ul>
              {partner.presentations.map((deck) => (
                <li key={deck.id}>
                  <Link
                    href={`/partners/${partner.slug}/presentations/${deck.id}`}
                    className="ed-presentation-card"
                  >
                    {deck.cover_url ? (
                      <img src={deck.cover_url} alt="" />
                    ) : (
                      <span className="ed-presentation-fallback" aria-hidden="true">
                        {partnersCopy.pdfLabel}
                      </span>
                    )}
                    <span>
                      <strong>{formatRuInline(deck.title)}</strong>
                      <span>
                        {deck.page_count ? partnersCopy.pages(deck.page_count) : partnersCopy.pdfLabel}
                      </span>
                    </span>
                    <span className="ed-presentation-cta">{partnersCopy.viewPresentation}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </EditorialShell>
  )
}
