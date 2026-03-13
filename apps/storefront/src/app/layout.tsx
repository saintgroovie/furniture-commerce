import type { Metadata } from "next"
import { getSiteUrl } from "@/lib/api/base"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "Woodright", template: "%s | Woodright" },
  description: "Мебель на заказ. Каталог, готовые комплекты по комнатам, заявки на расчёт.",
  openGraph: {
    siteName: "Woodright",
    locale: "ru_RU",
  },
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Woodright",
  url: getSiteUrl(),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <header style={{ padding: "1rem", borderBottom: "1px solid #eee" }}>
          <nav>
            <a href="/" style={{ marginRight: "1rem" }}>Главная</a>
            <a href="/catalog" style={{ marginRight: "1rem" }}>Каталог</a>
            <a href="/rooms" style={{ marginRight: "1rem" }}>Комнаты</a>
            <a href="/cart">Корзина</a>
          </nav>
        </header>
        <main style={{ padding: "1rem" }}>{children}</main>
      </body>
    </html>
  )
}
