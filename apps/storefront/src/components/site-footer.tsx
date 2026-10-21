"use client"

import Image from "next/image"
import Link from "next/link"
import { BespokeBadge } from "@/components/bespoke-badge"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { bespokeMedia } from "@/components/home/bespoke-media"
import { kidsMedia } from "@/components/home/kids-media"
import { footer } from "@/lib/woodright-copy"
import { useChromeVisual, useSiteSection } from "@/lib/use-site-section"

const sectionImages = {
  main: "/images/footer/bedroom.webp",
  kids: kidsMedia.heroSlides[0].src,
  bespoke: bespokeMedia.directions.furniture.src,
} as const

/** Shared buyer footer. Section identity follows the header's transition. */
export function SiteFooter({ year }: { year: number }) {
  const section = useSiteSection()
  const { section: visual, kids: visualKids, snap } = useChromeVisual()
  const homeHref = section === "kids" ? "/kids" : section === "bespoke" ? "/bespoke" : "/"

  return (
    <footer className={`wr-footer${snap ? " is-kids-snap" : ""}`} data-section={visual} id="site-footer">
      <section className="wr-footer-invitation" aria-labelledby="footer-invitation-title">
        <div className="wr-footer-photo" data-section={section}>
          <Image src={sectionImages[section]} alt="" fill sizes="(max-width: 759px) 100vw, 55vw" loading="lazy" unoptimized={section === "kids"} />
        </div>
        <div className="wr-footer-invitation-copy">
          <p className="wr-footer-eyebrow">{footer.invitation.eyebrow}</p>
          <h2 id="footer-invitation-title">
            {footer.invitation.title.map((line) => <span key={line}>{line}</span>)}
          </h2>
          <p className="wr-footer-invitation-text">{footer.invitation.body}</p>
          <div className="wr-footer-actions">
            <Link href="/bespoke/request" className="wr-footer-primary">{footer.invitation.primary}</Link>
            <Link href="/about/production" className="wr-footer-secondary">{footer.invitation.secondary}<Image src="/images/footer/arrow-right.svg" alt="" width={24} height={24} /></Link>
          </div>
        </div>
      </section>

      <div className="wr-footer-navigation">
        <div className="wr-footer-grid">
          <div className="wr-footer-brand">
            <Link href={homeHref} className="wr-footer-brand-link" aria-label="Woodright - на главную">
              <WoodrightWordmark className="wr-footer-small-wordmark" />
              <span className={`logo-kids-slot${visualKids ? " is-visible" : ""}${snap ? " is-snap" : ""}`} aria-hidden="true">
                <span className="logo-kids-badge">Kids</span>
              </span>
              {visual === "bespoke" ? <BespokeBadge /> : null}
            </Link>
            <p>{footer.brandText.map((line) => <span key={line}>{line}</span>)}</p>
          </div>
          <nav className="wr-footer-nav" aria-label="Разделы сайта">
            {footer.columns.map((column) => (
              <div className="wr-footer-column" key={column.title}>
                <h3>{column.title}</h3>
                <ul>
                  {column.links.map((link, index) => {
                    if ("joinPrevious" in link && link.joinPrevious) return null
                    const next = column.links[index + 1]
                    const continuation = next && "joinPrevious" in next && next.joinPrevious ? next : null
                    return (
                      <li key={link.href}>
                        <Link href={link.href}>{link.label}</Link>
                        {continuation ? <> <Link href={continuation.href}>{continuation.label}</Link></> : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </div>

      <div className="wr-footer-signature">
        <div className="wr-footer-signature-inner">
          <Link href={homeHref} className="wr-footer-display-wordmark" aria-label="Woodright - на главную">WOODRIGHT</Link>
          <div className="wr-footer-bottom">
            <span>{footer.copyright(year)}</span>
            <nav aria-label="Правовая информация">
              <ul>{footer.legalLinks.map((link) => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
