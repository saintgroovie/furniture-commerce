import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal-page-layout"
import { getSiteUrl } from "@/lib/api/base"
import { getLegalPage } from "@/lib/legal-content"
import { launchCanonical } from "@/lib/indexing-policy"
import { seo } from "@/lib/woodright-copy"

const page = getLegalPage("delivery")
const selfCanonical = launchCanonical(`${getSiteUrl()}/delivery`)

export const metadata: Metadata = {
  title: seo.delivery.title,
  description: seo.delivery.description,
  openGraph: {
    title: seo.delivery.title,
    url: "/delivery",
  },
  ...(selfCanonical ? { alternates: selfCanonical } : {}),
}

export default function DeliveryPage() {
  return <LegalPageLayout page={page} />
}
