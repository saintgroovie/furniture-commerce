import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "На заказ",
  description:
    "Мебель на заказ Woodright. Кухни, гардеробные, шкафы — индивидуальные проекты по вашим размерам.",
  openGraph: {
    title: "На заказ | Woodright",
    description:
      "Кухни, гардеробные, шкафы и другая мебель — индивидуальные проекты по вашим размерам.",
    url: "/bespoke",
  },
}

export default function BespokePage() {
  return (
    <div className="hero">
      <h1>Мебель на заказ</h1>
      <p>
        Кухни, гардеробные, шкафы и другая мебель — спроектируем и изготовим
        по вашим размерам из натуральных материалов.
      </p>
      <div className="hero-actions">
        <Link href="/bespoke/catalog" className="btn btn-primary">
          Каталог
        </Link>
        <Link href="/bespoke/request" className="btn btn-secondary">
          Заявка на расчёт
        </Link>
      </div>
    </div>
  )
}
