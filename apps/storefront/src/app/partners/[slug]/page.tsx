import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { EditorialFigure } from "@/components/editorial/editorial-figure"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { isPartnerPdf } from "@/lib/partner-file"
import { PartnerMark, hasPartnerMark } from "@/components/partners/partner-mark"
import { getPublicPartnerBySlug } from "@/lib/api/partners"
import { formatRuInline } from "@/lib/format-ru-copy"
import { partnersCopy, seo } from "@/lib/woodright-copy"
import { pageTitle } from "@/lib/page-title"
import "../partners-editorial.css"

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
    title: pageTitle(`${partner.name} - ${seo.partners.title}`),
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
      <article className="px-case ed-wrap">
        <div className="px-case-head">
          <p className="px-kicker">
            <Link href="/partners">{partnersCopy.backToIndex}</Link>
          </p>
          {partner.logo_url ? (
            <img className="ed-partner-logo" src={partner.logo_url} alt="" />
          ) : hasPartnerMark(partner.slug) ? (
            <div className="ed-partner-logo-mark">
              <PartnerMark slug={partner.slug} name={partner.name} />
            </div>
          ) : null}
          <h1>{formatRuInline(partner.name)}</h1>
          {partner.description ? <p className="ed-body">{formatRuInline(partner.description)}</p> : null}
          {partner.presentations
            .filter((deck) => (deck.slides?.length ?? 0) > 0 || isPartnerPdf(deck.file_url, deck.mime))
            .map((deck) => (
              <Link
                key={deck.id}
                href={`/partners/${partner.slug}/presentations/${deck.id}`}
                className="px-watch"
              >
                {(deck.slides?.length ?? 0) > 0 ? partnersCopy.viewPresentation : deck.title}
                <span className="px-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          {partner.website_url ? (
            <a
              className="px-quiet"
              href={partner.website_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${partnersCopy.website}: ${partner.name}`}
            >
              {partnersCopy.website}
            </a>
          ) : null}
        </div>

        {partner.images.length > 0 ? (
          <section className="px-case-gallery" aria-label={partnersCopy.materialsTitle}>
            {partner.images.map((src, index) => (
              <EditorialFigure
                key={src}
                className="px-mask"
                src={src}
                alt={`${partner.name}, ${index + 1}`}
              />
            ))}
          </section>
        ) : null}
      </article>
    </EditorialShell>
  )
}
