import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Производство",
  description: "Производство мебели Woodright.",
  openGraph: {
    title: "Производство | Woodright",
    url: "/about/production",
  },
}

export default function ProductionPage() {
  return (
    <div className="service-page">
      <h1>Производство</h1>
      <p className="info-text">
        Раздел о производстве готовится. Здесь появятся подробности о процессе изготовления мебели Woodright.
      </p>
      <div className="nav-links">
        <Link href="/about" className="btn btn-secondary">О компании</Link>
        <Link href="/catalog" className="btn btn-secondary">Каталог</Link>
      </div>
    </div>
  )
}
