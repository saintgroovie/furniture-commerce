import type { Metadata, Viewport } from "next"
import Link from "next/link"
import { getSiteUrl } from "@/lib/api/base"
import { ContactsNavDropdown } from "@/components/contacts-nav-dropdown"
import { HeaderCartLink } from "@/components/header-cart-link"
import { HeaderLogo } from "@/components/header-logo"
import { MobileNav } from "@/components/mobile-nav"
import { NavDropdown } from "@/components/nav-dropdown"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { KidsSectionProvider } from "@/lib/use-kids-section"
import { getShowroomOrganizationContactLd } from "@/lib/showroom-contacts"
import { a11yCopy, footer as footerCopy, nav as navCopy, seo } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import "./globals.css"

// Local Design Mode: do not use next/font/google. Google Fonts TLS stalls freeze
// Cursor Browser / Design Mode. System stack keeps UI responsive offline.
const localSansClass = "wr-local-sans"

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "Woodright", template: "%s | Woodright" },
  description: seo.home.description,
  openGraph: {
    siteName: "Woodright",
    locale: "ru_RU",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
}

export const viewport: Viewport = {
  themeColor: "#faf8f5",
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Woodright",
  url: getSiteUrl(),
  ...getShowroomOrganizationContactLd(),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className={localSansClass}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <a href="#main-content" className="skip-link">
          {a11yCopy.skipToContent}
        </a>
        {/* Provider sits above both the header and <main> so the sticky
            header tint and the route loader share one kids flag (pathname
            + optimistic link clicks). */}
        <KidsSectionProvider>
        <SiteHeader>
          {/* Top bar */}
          <div className="header-top">
            <div className="container header-top-inner">
              <span className="header-top-left">{navCopy.showroom}</span>
              <HeaderLogo />
              <div className="header-top-right">
                <NavDropdown
                  href="/designers/terms"
                  label={navCopy.designers}
                  items={[
                    { label: "Условия сотрудничества", href: "/designers/terms" },
                    { label: "Материалы", href: "/designers/materials" },
                    { label: "Оставить заявку", href: "/designers/request" },
                  ]}
                />
                <ContactsNavDropdown label={navCopy.contacts} />
              </div>
            </div>
          </div>

          {/* Main nav */}
          <div className="header-main">
            <div className="container header-main-inner">
              <nav className="header-nav" aria-label="Основная навигация">
                <NavDropdown
                  href="/catalog"
                  label={navCopy.catalog}
                  items={[
                    { label: "Все", href: "/catalog" },
                    { label: "Готовые", href: "/catalog?product_type=STANDARD" },
                    { label: "С выбором исполнения", href: "/catalog?product_type=CONFIGURABLE" },
                  ]}
                />

                <NavDropdown
                  href="/kids"
                  label={navCopy.kids}
                  className="header-nav-kids"
                  items={[
                    { label: "Каталог", href: "/kids/catalog" },
                    { label: "Комнаты", href: "/kids/rooms" },
                    { label: "О разделе", href: "/kids" },
                  ]}
                />

                <Link href="/rooms" className="header-nav-link">{navCopy.rooms}</Link>

                <NavDropdown
                  href="/bespoke"
                  label={navCopy.bespoke}
                  items={[
                    { label: "Оставить заявку", href: "/bespoke/request" },
                    { label: "Направления", href: "/bespoke/catalog" },
                    { label: "Как это работает", href: "/bespoke" },
                  ]}
                />

                <NavDropdown
                  href="/about"
                  label={navCopy.about}
                  items={[
                    { label: "О компании", href: "/about" },
                    { label: "Производство", href: "/about/production" },
                    { label: "Материалы", href: "/about/materials" },
                  ]}
                />
              </nav>
              <HeaderCartLink />
            </div>
          </div>

          <MobileNav />
        </SiteHeader>
        <main id="main-content" className="container page-section" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter
          brandBody={
            <div className="footer-column-body footer-brand-lead">
              {footerCopy.brandText.lead.map((line) => (
                <span className="footer-row" key={line}>
                  {formatRuInline(line)}
                </span>
              ))}
              <ul className="footer-brand-bullets">
                {footerCopy.brandText.bullets.map((line) => (
                  <li className="footer-row" key={line}>
                    {formatRuInline(line)}
                  </li>
                ))}
              </ul>
              {footerCopy.brandText.closing.map((line) => (
                <span className="footer-row" key={line}>
                  {formatRuInline(line)}
                </span>
              ))}
            </div>
          }
          nav={
            <nav className="footer-nav" aria-label="Разделы сайта">
              {footerCopy.columns.map((column) => (
                <div className="footer-column" key={column.title}>
                  <h3 className="footer-column-title">{column.title}</h3>
                  <ul className="footer-column-body footer-column-links">
                    {column.links.map((link) => (
                      <li className="footer-row" key={link.href}>
                        <Link href={link.href}>{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          }
          bottom={
            <div className="footer-bottom">
              <span>{footerCopy.copyright(new Date().getFullYear())}</span>
            </div>
          }
        />
        </KidsSectionProvider>
      </body>
    </html>
  )
}
