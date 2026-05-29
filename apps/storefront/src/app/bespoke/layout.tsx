import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: { default: "По проекту", template: "%s | По проекту | Woodright" },
  description:
    "Мебель на заказ. Кухни, гардеробные, шкафы — индивидуальные проекты по вашим размерам.",
}

export default function BespokeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bespoke-theme">
      <nav className="bespoke-nav" aria-label="По проекту">
        <Link href="/bespoke" className="bespoke-nav-title">
          По проекту
        </Link>
        <div className="bespoke-nav-links">
          <Link href="/bespoke/catalog">Каталог</Link>
          <Link href="/bespoke/request">Заявка на расчёт</Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
