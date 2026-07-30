import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal-page-layout"
import { getSiteUrl } from "@/lib/api/base"
import { getLegalPage } from "@/lib/legal-content"
import { launchCanonical } from "@/lib/indexing-policy"
import { seo } from "@/lib/woodright-copy"

const page = getLegalPage("terms")
const selfCanonical = launchCanonical(`${getSiteUrl()}/terms`)

export const metadata: Metadata = {
  title: seo.terms.title,
  description: seo.terms.description,
  openGraph: {
    title: seo.terms.title,
    url: "/terms",
  },
  ...(selfCanonical ? { alternates: selfCanonical } : {}),
}

export default function TermsPage() {
  return <LegalPageLayout page={page} />
}
