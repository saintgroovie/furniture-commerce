import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal-page-layout"
import { getSiteUrl } from "@/lib/api/base"
import { getLegalPage } from "@/lib/legal-content"
import { launchCanonical } from "@/lib/indexing-policy"
import { seo } from "@/lib/woodright-copy"

const page = getLegalPage("payment")
const selfCanonical = launchCanonical(`${getSiteUrl()}/payment`)

export const metadata: Metadata = {
  title: seo.payment.title,
  description: seo.payment.description,
  openGraph: {
    title: seo.payment.title,
    url: "/payment",
  },
  ...(selfCanonical ? { alternates: selfCanonical } : {}),
}

export default function PaymentPage() {
  return <LegalPageLayout page={page} />
}
