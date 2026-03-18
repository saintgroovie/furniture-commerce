import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Link from "next/link"
import { getSiteUrl } from "@/lib/api/base"
import "./globals.css"

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-sans",
})

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
    <html lang="ru" className={inter.variable}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <header className="site-header">
          {/* Top bar */}
          <div className="header-top">
            <div className="container header-top-inner">
              <span className="header-top-left">Шоурум: Москва</span>
              <Link href="/" className="logo">WOODRIGHT</Link>
              <div className="header-top-right">
                <div className="nav-dropdown">
                  <Link href="/designers/terms" className="nav-dropdown-trigger">Дизайнерам</Link>
                  <div className="nav-dropdown-menu">
                    <Link href="/designers/terms">Условия сотрудничества</Link>
                    <Link href="/designers/materials">Материалы</Link>
                    <Link href="/designers/request">Оставить заявку</Link>
                  </div>
                </div>
                <Link href="/contacts">Контакты</Link>
              </div>
            </div>
          </div>

          {/* Main nav */}
          <div className="header-main">
            <div className="container header-main-inner">
              <nav className="header-nav" aria-label="Основная навигация">
                <div className="nav-dropdown">
                  <Link href="/catalog" className="nav-dropdown-trigger">Каталог</Link>
                  <div className="nav-dropdown-menu">
                    <Link href="/catalog">Все</Link>
                    <Link href="/catalog?product_type=STANDARD">Готовые</Link>
                    <Link href="/catalog?product_type=CONFIGURABLE">С выбором исполнения</Link>
                  </div>
                </div>

                <Link href="/rooms" className="header-nav-link">Комнаты</Link>

                <div className="nav-dropdown">
                  <Link href="/kids" className="nav-dropdown-trigger">Детская</Link>
                  <div className="nav-dropdown-menu">
                    <Link href="/kids/catalog">Каталог</Link>
                    <Link href="/kids/rooms">Комнаты</Link>
                    <Link href="/kids">О разделе</Link>
                  </div>
                </div>

                <div className="nav-dropdown">
                  <Link href="/bespoke" className="nav-dropdown-trigger">По проекту</Link>
                  <div className="nav-dropdown-menu">
                    <Link href="/bespoke">Как это работает</Link>
                    <Link href="/bespoke/catalog">Направления</Link>
                    <Link href="/bespoke/request">Оставить заявку</Link>
                  </div>
                </div>

                <div className="nav-dropdown">
                  <Link href="/about" className="nav-dropdown-trigger">О бренде</Link>
                  <div className="nav-dropdown-menu">
                    <Link href="/about">О компании</Link>
                    <Link href="/about/production">Производство</Link>
                    <Link href="/about/materials">Материалы</Link>
                  </div>
                </div>
              </nav>
              <Link href="/cart" className="header-cart-link" aria-label="Корзина">Корзина</Link>
            </div>
          </div>

          {/* Mobile nav toggle (checkbox hack, no JS) */}
          <input type="checkbox" id="mobile-nav-toggle" className="mobile-nav-checkbox" aria-hidden="true" />
          <label htmlFor="mobile-nav-toggle" className="mobile-nav-btn" aria-label="Меню">
            <span className="mobile-nav-icon" />
          </label>
          <div className="mobile-nav-overlay">
            <nav className="mobile-nav" aria-label="Мобильная навигация">
              <Link href="/catalog">Каталог</Link>
              <Link href="/rooms">Комнаты</Link>
              <Link href="/kids">Детская</Link>
              <Link href="/bespoke">По проекту</Link>
              <Link href="/cart">Корзина</Link>
              <Link href="/contacts">Контакты</Link>
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
