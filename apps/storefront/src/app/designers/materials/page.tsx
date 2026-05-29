import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Материалы для дизайнеров",
  description: "Материалы и ресурсы Woodright для дизайнеров интерьера.",
  openGraph: {
    title: "Дизайнерам — материалы | Woodright",
    url: "/designers/materials",
  },
}

export default function DesignersMaterialsPage() {
  return (
    <div className="service-page">
      <h1>Материалы для дизайнеров</h1>
      <p className="info-text">
        Раздел готовится. Здесь появятся каталоги отделок, чертежи и ресурсы для работы с проектами Woodright.
      </p>
      <div className="nav-links">
        <Link href="/designers/request" className="btn btn-primary">Оставить заявку</Link>
        <Link href="/designers/terms" className="btn btn-secondary">Условия сотрудничества</Link>
      </div>
    </div>
  )
}
