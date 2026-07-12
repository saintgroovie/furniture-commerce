import Link from "next/link"
import type { Metadata } from "next"
import { designersRequestCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: seo.designersRequest.title,
  description: seo.designersRequest.description,
  openGraph: {
    title: "Дизайнерам - заявка | Woodright",
    url: "/designers/request",
  },
}

export default function DesignersRequestPage() {
  return (
    <div className="service-page">
      <h1>{designersRequestCopy.h1}</h1>
      <CopyLines className="info-text" lines={designersRequestCopy.lead} />
      <div className="nav-links">
        <Link href="/bespoke/request" className="btn btn-primary">{designersRequestCopy.ctaPrimary}</Link>
        <Link href="/designers/terms" className="btn btn-secondary">{designersRequestCopy.ctaSecondary}</Link>
      </div>
    </div>
  )
}
