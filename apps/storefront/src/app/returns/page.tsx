import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal-page-layout"
import { getSiteUrl } from "@/lib/api/base"
import { getLegalPage } from "@/lib/legal-content"
import { launchCanonical } from "@/lib/indexing-policy"
import { seo } from "@/lib/woodright-copy"

const page = getLegalPage("returns")
const selfCanonical = launchCanonical(`${getSiteUrl()}/returns`)

export const metadata: Metadata = {
  title: seo.returns.title,
  description: seo.returns.description,
  openGraph: {
    title: seo.returns.title,
    url: "/returns",
  },
  ...(selfCanonical ? { alternates: selfCanonical } : {}),
}

export default function ReturnsPage() {
  return <LegalPageLayout page={page} />
}
