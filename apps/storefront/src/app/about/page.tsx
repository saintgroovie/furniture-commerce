import Link from "next/link"
import type { Metadata } from "next"
import { aboutCopy, seo } from "@/lib/woodright-copy"

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
      <p className="info-text">{aboutCopy.lead}</p>
      <section>
        <h2>{aboutCopy.missionTitle}</h2>
        <p className="info-text">{aboutCopy.missionText}</p>
      </section>
      <div className="nav-links">
        <Link href="/about/production" className="btn btn-secondary">Производство</Link>
        <Link href="/about/materials" className="btn btn-secondary">Материалы</Link>
        <Link href="/catalog" className="btn btn-primary">Перейти в каталог</Link>
      </div>
    </div>
  )
}
