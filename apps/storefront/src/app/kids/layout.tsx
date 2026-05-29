import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: { default: "Детская", template: "%s | Детская | Woodright" },
  description:
    "Мебель для детских комнат. Готовые комплекты, безопасные материалы, индивидуальные размеры.",
}

export default function KidsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="kids-theme">
      <nav className="kids-nav" aria-label="Детская">
        <Link href="/kids" className="kids-nav-title">
          Детская
        </Link>
        <div className="kids-nav-links">
          <Link href="/kids/catalog">Каталог</Link>
          <Link href="/kids/rooms">Комнаты</Link>
          <Link href="/bespoke/request">Расчёт</Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
