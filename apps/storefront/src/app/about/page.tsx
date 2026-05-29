import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "О компании",
  description: "Woodright — мебельная мастерская. Информация о компании.",
  openGraph: {
    title: "О компании | Woodright",
    description: "Информация о компании Woodright.",
    url: "/about",
  },
}

export default function AboutPage() {
  return (
    <div className="service-page">
      <h1>О компании</h1>
      <p className="info-text">
        Раздел о Woodright готовится к публикации. Здесь появится информация о мастерской, подходе к производству и материалах.
      </p>
      <div className="nav-links">
        <Link href="/catalog" className="btn btn-primary">Перейти в каталог</Link>
        <Link href="/contacts" className="btn btn-secondary">Контакты</Link>
      </div>
    </div>
  )
}
