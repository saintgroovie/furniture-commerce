import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Условия сотрудничества",
  description: "Условия сотрудничества Woodright для дизайнеров интерьера.",
  openGraph: {
    title: "Дизайнерам — условия | Woodright",
    url: "/designers/terms",
  },
}

export default function DesignersTermsPage() {
  return (
    <div className="service-page">
      <h1>Условия сотрудничества</h1>
      <p className="info-text">
        Раздел для дизайнеров готовится. Здесь появятся условия партнёрской программы и работы с проектами.
      </p>
      <div className="nav-links">
        <Link href="/designers/request" className="btn btn-primary">Оставить заявку</Link>
        <Link href="/catalog" className="btn btn-secondary">Каталог</Link>
      </div>
    </div>
  )
}
