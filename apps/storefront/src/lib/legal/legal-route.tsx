import type { Metadata } from "next"
import { LegalPageView } from "@/components/legal-page-view"
import { buildLegalPage, type LegalPageId } from "@/lib/legal/legal-content"
import { getSiteUrl } from "@/lib/api/base"
import { indexingRobotsMetadata, launchCanonical } from "@/lib/indexing-policy"

/**
 * Self-canonical uses `launchCanonical` (see `@/lib/indexing-policy`): once
 * `WOODRIGHT_LAUNCH_MODE` is set, a `private_noindex` production candidate
 * still gets a stable canonical to the real host - only the robots
 * directive (`indexingRobotsMetadata`) says noindex, not the canonical link.
 */
export function legalPageMetadata(id: LegalPageId): Metadata {
  const page = buildLegalPage(id)
  const selfCanonical = launchCanonical(`${getSiteUrl()}${page.path}`)
  return {
    title: page.title,
    description: page.lead.join(" "),
    robots: indexingRobotsMetadata(),
    openGraph: {
      title: page.title,
      description: page.lead.join(" "),
      url: page.path,
    },
    ...(selfCanonical ? { alternates: selfCanonical } : {}),
  }
}

export function LegalRoutePage({ id }: { id: LegalPageId }) {
  return <LegalPageView page={buildLegalPage(id)} />
}
