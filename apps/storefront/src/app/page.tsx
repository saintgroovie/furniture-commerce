import type { Metadata } from "next"
import Link from "next/link"
import { homeCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"

export const metadata: Metadata = {
  title: seo.home.title,
  description: seo.home.description,
  openGraph: {
    title: seo.home.title,
    description: seo.home.description,
    url: "/",
  },
}

export default function HomePage() {
  return (
    <div>
      <div className="hero">
        <h1>{homeCopy.hero.h1}</h1>
        <CopyLines lines={homeCopy.hero.lead} />
        <div className="hero-actions">
          <Link href="/catalog" className="btn btn-primary">{homeCopy.hero.ctaPrimary}</Link>
          <Link href="/rooms" className="btn btn-secondary">{homeCopy.hero.ctaSecondary}</Link>
        </div>
        <div className="hero-chips">
          {homeCopy.hero.chips.map((chip) => (
            <span className="hero-chip" key={chip}>{chip}</span>
          ))}
        </div>
        <CopyLines className="hero-note" lines={homeCopy.hero.note} />
      </div>

      <section className="home-section">
        <h2 className="home-section-title">{homeCopy.quickEntries.title}</h2>
        <div className="home-quick-entries">
          {homeCopy.quickEntries.cards.map((card) => (
            <div className="home-quick-entry" key={card.href}>
              <h3>{card.title}</h3>
              <CopyLines lines={card.text} />
              <Link href={card.href} className="home-quick-entry-link">{card.cta} →</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-text-block">
          <div>
            <h2 className="home-text-block-title">{homeCopy.woodBlock.title}</h2>
            <CopyLines className="home-text-block-text" lines={homeCopy.woodBlock.text} />
          </div>
          <ul className="home-text-block-bullets">
            {homeCopy.woodBlock.bullets.map((bullet) => (
              <li key={bullet}>{formatRuInline(bullet)}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-section">
        <div className="home-kids-block">
          <h2 className="home-text-block-title">{homeCopy.kidsBlock.title}</h2>
          <CopyLines className="home-text-block-text" lines={homeCopy.kidsBlock.text} />
          <div className="home-text-block-cta">
            <Link href="/kids" className="btn btn-primary">{homeCopy.kidsBlock.cta}</Link>
          </div>
        </div>
      </section>

      <section className="home-section">
        <h2 className="home-text-block-title">{homeCopy.projectBlock.title}</h2>
        <CopyLines className="home-text-block-text" lines={homeCopy.projectBlock.text} />
        <div className="home-text-block-cta cta-group">
          <Link href="/bespoke/request" className="btn btn-primary">{homeCopy.projectBlock.ctaPrimary}</Link>
          <Link href="/bespoke/catalog" className="btn btn-secondary">{homeCopy.projectBlock.ctaSecondary}</Link>
        </div>
      </section>

      <section className="home-final-cta">
        <h2 className="home-text-block-title">{homeCopy.finalCta.title}</h2>
        <CopyLines lines={homeCopy.finalCta.text} />
        <Link href="/bespoke/request" className="btn btn-primary">{homeCopy.finalCta.button}</Link>
      </section>
    </div>
  )
}
