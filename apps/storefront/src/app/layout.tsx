import type { Metadata } from "next"
import Link from "next/link"
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
        <header className="site-header">
          <div className="container">
            <Link href="/" className="logo">Woodright</Link>
            <nav>
              <Link href="/catalog">Каталог</Link>
              <Link href="/rooms">Комнаты</Link>
              <Link href="/bespoke">Расчёт</Link>
              <Link href="/cart">Корзина</Link>
            </nav>
          </div>
        </header>
        <main className="container page-section">{children}</main>
        <footer className="site-footer">
          <div className="container">© Woodright</div>
        </footer>
      </body>
    </html>
  )
}
