import Link from "next/link"
import type { Metadata } from "next"
import { aboutCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: seo.about.title,
  description: seo.about.description,
  openGraph: {
    title: seo.about.title,
    description: seo.about.description,
    url: "/about",
  },
}

export default function AboutPage() {
  return (
    <div className="service-page">
      <h1>{aboutCopy.h1}</h1>
      <CopyLines className="info-text" lines={aboutCopy.lead} />
      <section>
        <h2>{aboutCopy.missionTitle}</h2>
        <CopyLines className="info-text" lines={aboutCopy.missionText} />
      </section>
      <div className="nav-links">
        <Link href="/about/production" className="btn btn-secondary">Производство</Link>
        <Link href="/about/materials" className="btn btn-secondary">Материалы</Link>
        <Link href="/catalog" className="btn btn-primary">Перейти в каталог</Link>
      </div>
    </div>
  )
}
