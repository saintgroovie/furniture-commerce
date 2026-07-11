import Link from "next/link"
import type { Metadata } from "next"
import { aboutMaterialsCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.aboutMaterials.title,
  description: seo.aboutMaterials.description,
  openGraph: {
    title: seo.aboutMaterials.title,
    url: "/about/materials",
  },
}

export default function MaterialsPage() {
  return (
    <div className="service-page">
      <h1>{aboutMaterialsCopy.h1}</h1>
      <p className="info-text">{aboutMaterialsCopy.lead}</p>
      <p className="info-text">{aboutMaterialsCopy.body}</p>
      <div className="nav-links">
        <Link href="/bespoke/request" className="btn btn-primary">Обсудить проект</Link>
        <Link href="/about" className="btn btn-secondary">О бренде</Link>
        <Link href="/catalog" className="btn btn-secondary">Каталог</Link>
      </div>
    </div>
  )
}
