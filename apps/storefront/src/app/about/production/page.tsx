import Link from "next/link"
import type { Metadata } from "next"
import { CopyLines } from "@/components/copy-lines"
import { aboutProductionCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.aboutProduction.title,
  description: seo.aboutProduction.description,
  openGraph: {
    title: seo.aboutProduction.title,
    url: "/about/production",
  },
}

export default function ProductionPage() {
  return (
    <div className="service-page">
      <h1>{aboutProductionCopy.h1}</h1>
      <CopyLines className="info-text" lines={aboutProductionCopy.lead} />
      <CopyLines className="info-text" lines={aboutProductionCopy.body} />
      <div className="nav-links">
        <Link href="/about" className="btn btn-secondary">О бренде</Link>
        <Link href="/catalog" className="btn btn-secondary">Каталог</Link>
      </div>
    </div>
  )
}
