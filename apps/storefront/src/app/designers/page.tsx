import Link from "next/link"
import type { Metadata } from "next"
import { a1Designers } from "@/lib/package-a1-copy"

export const metadata: Metadata = {
  title: a1Designers.title,
  description: a1Designers.description,
  openGraph: {
    title: a1Designers.title,
    description: a1Designers.description,
    url: "/designers",
  },
}

export default function DesignersPage() {
  return (
    <div className="service-page">
      <p className="page-caption">{a1Designers.eyebrow}</p>
      <h1>{a1Designers.h1}</h1>
      <p className="info-text">{a1Designers.lead}</p>
      <div className="nav-links cta-group">
        <Link href="/designers/request" className="btn btn-primary">
          {a1Designers.ctaPrimary}
        </Link>
        <Link href="/catalog" className="btn btn-secondary">
          {a1Designers.ctaSecondary}
        </Link>
      </div>
    </div>
  )
}
