import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Link from "next/link"
import { getSiteUrl } from "@/lib/api/base"
import { NavDropdown } from "@/components/nav-dropdown"
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
                <NavDropdown
                  href="/designers/terms"
                  label="Дизайнерам"
                  items={[
                    { label: "Условия сотрудничества", href: "/designers/terms" },
                    { label: "Материалы", href: "/designers/materials" },
                    { label: "Оставить заявку", href: "/designers/request" },
                  ]}
                />
                <Link href="/contacts">Контакты</Link>
              </div>
            </div>
          </div>

          {/* Main nav */}
          <div className="header-main">
            <div className="container header-main-inner">
              <nav className="header-nav" aria-label="Основная навигация">
                <NavDropdown
                  href="/catalog"
                  label="Каталог"
                  items={[
                    { label: "Все", href: "/catalog" },
                    { label: "Готовые", href: "/catalog?product_type=STANDARD" },
                    { label: "С выбором исполнения", href: "/catalog?product_type=CONFIGURABLE" },
                  ]}
                />

                <Link href="/rooms" className="header-nav-link">Комнаты</Link>

                <NavDropdown
                  href="/kids"
                  label="Детская"
                  items={[
                    { label: "Каталог", href: "/kids/catalog" },
                    { label: "Комнаты", href: "/kids/rooms" },
                    { label: "О разделе", href: "/kids" },
                  ]}
                />

                <NavDropdown
                  href="/bespoke"
                  label="По проекту"
                  items={[
                    { label: "Как это работает", href: "/bespoke" },
                    { label: "Направления", href: "/bespoke/catalog" },
                    { label: "Оставить заявку", href: "/bespoke/request" },
                  ]}
                />

                <NavDropdown
                  href="/about"
                  label="О бренде"
                  items={[
                    { label: "О компании", href: "/about" },
                    { label: "Производство", href: "/about/production" },
                    { label: "Материалы", href: "/about/materials" },
                  ]}
                />
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
