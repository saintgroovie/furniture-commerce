import Link from "next/link"
import type { Metadata } from "next"
import { designersMaterialsCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.designersMaterials.title,
  description: seo.designersMaterials.description,
  openGraph: {
    title: "Дизайнерам — материалы | Woodright",
    url: "/designers/materials",
  },
}

export default function DesignersMaterialsPage() {
  return (
    <div className="service-page">
      <h1>{designersMaterialsCopy.h1}</h1>
      <p className="info-text">{designersMaterialsCopy.lead}</p>
      <p className="info-text">{designersMaterialsCopy.body}</p>
      <div className="nav-links">
        <Link href="/designers/request" className="btn btn-primary">{designersMaterialsCopy.ctaPrimary}</Link>
        <Link href="/designers/terms" className="btn btn-secondary">{designersMaterialsCopy.ctaSecondary}</Link>
      </div>
    </div>
  )
}
