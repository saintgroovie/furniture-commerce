import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Контакты",
  description: "Контакты мебельной мастерской Woodright.",
  openGraph: {
    title: "Контакты | Woodright",
    url: "/contacts",
  },
}

export default function ContactsPage() {
  return (
    <div className="service-page">
      <h1>Контакты</h1>
      <p className="info-text">
        Полная контактная информация готовится к публикации. Если у вас есть вопрос или вы хотите обсудить проект — оставьте заявку, и мы свяжемся с вами.
      </p>
      <div className="nav-links">
        <Link href="/bespoke/request" className="btn btn-primary">Оставить заявку</Link>
        <Link href="/catalog" className="btn btn-secondary">Перейти в каталог</Link>
      </div>
    </div>
  )
}
