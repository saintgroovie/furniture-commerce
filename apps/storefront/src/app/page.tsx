import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Главная",
  description: "Woodright — мебель на заказ. Каталог, готовые комплекты по комнатам, заявки на расчёт.",
  openGraph: {
    title: "Woodright — мебель на заказ",
    description: "Каталог, готовые комплекты по комнатам, заявки на расчёт.",
    url: "/",
  },
}

export default function HomePage() {
  return (
    <div className="hero">
      <h1>Мебель на заказ</h1>
      <p>Каталог готовой мебели, комплекты по комнатам и индивидуальные проекты по вашим размерам.</p>
      <div className="hero-actions">
        <Link href="/catalog" className="btn btn-primary">Каталог</Link>
        <Link href="/rooms" className="btn btn-secondary">Комнаты</Link>
        <Link href="/bespoke" className="btn btn-secondary">Заявка на расчёт</Link>
      </div>
    </div>
  )
}
