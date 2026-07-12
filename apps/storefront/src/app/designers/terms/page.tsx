import Link from "next/link"
import type { Metadata } from "next"
import { designersTermsCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: seo.designersTerms.title,
  description: seo.designersTerms.description,
  openGraph: {
    title: "Дизайнерам - условия | Woodright",
    url: "/designers/terms",
  },
}

export default function DesignersTermsPage() {
  return (
    <div className="service-page">
      <h1>{designersTermsCopy.h1}</h1>
      <CopyLines className="info-text" lines={designersTermsCopy.lead} />
      <CopyLines className="info-text" lines={designersTermsCopy.body} />
      <div className="nav-links">
        <Link href="/designers/request" className="btn btn-primary">{designersTermsCopy.ctaPrimary}</Link>
        <Link href="/designers/materials" className="btn btn-secondary">Материалы</Link>
        <Link href="/catalog" className="btn btn-secondary">{designersTermsCopy.ctaSecondary}</Link>
      </div>
    </div>
  )
}
