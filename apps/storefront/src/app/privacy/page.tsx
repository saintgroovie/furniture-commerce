import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal-page-layout"
import { getSiteUrl } from "@/lib/api/base"
import { getLegalPage } from "@/lib/legal-content"
import { launchCanonical } from "@/lib/indexing-policy"
import { seo } from "@/lib/woodright-copy"

const page = getLegalPage("privacy")
// Always self-canonical to the production host when available (see
// @/lib/indexing-policy launchCanonical) - robots noindex/index is decided
// separately in layout.tsx / middleware.ts.
const selfCanonical = launchCanonical(`${getSiteUrl()}/privacy`)

export const metadata: Metadata = {
  title: seo.privacy.title,
  description: seo.privacy.description,
  openGraph: {
    title: seo.privacy.title,
    url: "/privacy",
  },
  ...(selfCanonical ? { alternates: selfCanonical } : {}),
}

export default function PrivacyPage() {
  return <LegalPageLayout page={page} />
}
