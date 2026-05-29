import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Детская",
  description:
    "Мебель для детских комнат Woodright. Готовые комплекты, безопасные материалы, индивидуальные размеры.",
  openGraph: {
    title: "Детская | Woodright",
    description:
      "Мебель для детских комнат. Готовые комплекты и индивидуальные проекты.",
    url: "/kids",
  },
}

export default function KidsPage() {
  return (
    <div className="hero">
      <h1>Мебель для детской</h1>
      <p>
        Безопасные материалы, продуманная эргономика и индивидуальные размеры —
        для комнат, в которых растут дети.
      </p>
      <div className="hero-actions">
        <Link href="/kids/catalog" className="btn btn-primary">
          Каталог
        </Link>
        <Link href="/kids/rooms" className="btn btn-secondary">
          Готовые комнаты
        </Link>
        <Link href="/bespoke/request" className="btn btn-secondary">
          Заявка на расчёт
        </Link>
      </div>
    </div>
  )
}
