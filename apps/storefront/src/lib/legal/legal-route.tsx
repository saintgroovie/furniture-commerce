import type { Metadata } from "next"
import { LegalPageView } from "@/components/legal-page-view"
import { buildLegalPage, type LegalPageId } from "@/lib/legal/legal-content"
import { indexingRobotsMetadata } from "@/lib/indexing-policy"

export function legalPageMetadata(id: LegalPageId): Metadata {
  const page = buildLegalPage(id)
  return {
    title: page.title,
    description: page.lead.join(" "),
    robots: indexingRobotsMetadata(),
    openGraph: {
      title: page.title,
      description: page.lead.join(" "),
      url: page.path,
    },
  }
}

export function LegalRoutePage({ id }: { id: LegalPageId }) {
  return <LegalPageView page={buildLegalPage(id)} />
}
