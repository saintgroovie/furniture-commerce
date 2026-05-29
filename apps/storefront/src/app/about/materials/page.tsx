import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Материалы",
  description: "Материалы, используемые в мебели Woodright.",
  openGraph: {
    title: "Материалы | Woodright",
    url: "/about/materials",
  },
}

export default function MaterialsPage() {
  return (
    <div className="service-page">
      <h1>Материалы</h1>
      <p className="info-text">
        Раздел о материалах готовится. Здесь появится информация о дереве, отделке и фурнитуре, которые мы используем.
      </p>
      <div className="nav-links">
        <Link href="/about" className="btn btn-secondary">О компании</Link>
        <Link href="/catalog" className="btn btn-secondary">Каталог</Link>
      </div>
    </div>
  )
}
