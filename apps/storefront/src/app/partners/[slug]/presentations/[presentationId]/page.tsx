import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { CopyLines } from "@/components/copy-lines"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { PresentationViewer } from "@/components/partners/presentation-viewer"
import { getPublicPartnerBySlug } from "@/lib/api/partners"
import { partnersCopy, seo } from "@/lib/woodright-copy"

type Params = { slug: string; presentationId: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug, presentationId } = await params
  const partner = await getPublicPartnerBySlug(slug)
  const deck = partner?.presentations.find((item) => item.id === presentationId)
  if (!deck || !partner) return { title: seo.partners.title }
  return {
    title: `${deck.title} - ${partner.name}`,
    description: seo.partners.description,
  }
}

export default async function PresentationPage({ params }: { params: Promise<Params> }) {
  const { slug, presentationId } = await params
  const partner = await getPublicPartnerBySlug(slug)
  const deck = partner?.presentations.find((item) => item.id === presentationId)
  if (!partner || !deck) notFound()

  return (
    <EditorialShell theme="partners">
      <article className="ed-viewer ed-wrap">
        <p className="ed-eyebrow">
          <Link href={`/partners/${partner.slug}`}>{partner.name}</Link>
        </p>
        <h1>{deck.title}</h1>
        {deck.page_count ? <p className="ed-body">{partnersCopy.pages(deck.page_count)}</p> : null}
        <PresentationViewer
          src={deck.file_url}
          title={deck.title}
          mime={deck.mime}
        />
        <CopyLines className="ed-body ed-body--muted" lines={partnersCopy.viewerFallback} />
      </article>
    </EditorialShell>
  )
}
