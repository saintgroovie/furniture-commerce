import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Заявка на сотрудничество",
  description: "Оставить заявку на сотрудничество с Woodright.",
  openGraph: {
    title: "Дизайнерам — заявка | Woodright",
    url: "/designers/request",
  },
}

export default function DesignersRequestPage() {
  return (
    <div className="service-page">
      <h1>Заявка на сотрудничество</h1>
      <p className="info-text">
        Форма заявки для дизайнеров готовится. Пока вы можете оставить заявку на расчёт через общую форму — мы свяжемся и обсудим условия сотрудничества.
      </p>
      <div className="nav-links">
        <Link href="/bespoke/request" className="btn btn-primary">Оставить заявку на расчёт</Link>
        <Link href="/designers/terms" className="btn btn-secondary">Условия сотрудничества</Link>
      </div>
    </div>
  )
}
