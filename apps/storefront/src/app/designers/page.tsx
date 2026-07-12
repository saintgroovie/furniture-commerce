import Link from "next/link"
import type { Metadata } from "next"
import { designersLandingCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: seo.designersLanding.title,
  description: seo.designersLanding.description,
  openGraph: {
    title: seo.designersLanding.title,
    description: seo.designersLanding.description,
    url: "/designers",
  },
}

export default function DesignersPage() {
  return (
    <div className="service-page">
      <p className="page-caption">{designersLandingCopy.eyebrow}</p>
      <h1>{designersLandingCopy.h1}</h1>
      <CopyLines className="info-text" lines={designersLandingCopy.lead} />
      <div className="nav-links cta-group">
        <Link href="/designers/request" className="btn btn-primary">
          {designersLandingCopy.ctaPrimary}
        </Link>
        <Link href="/catalog" className="btn btn-secondary">
          {designersLandingCopy.ctaSecondary}
        </Link>
      </div>
      <p className="page-caption" style={{ marginTop: "1.25rem" }}>
        <Link href="/designers/terms">{designersLandingCopy.termsLink}</Link>
        {" · "}
        <Link href="/designers/materials">{designersLandingCopy.materialsLink}</Link>
      </p>
    </div>
  )
}
