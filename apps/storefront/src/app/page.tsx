import type { Metadata } from "next"
import Link from "next/link"
import { homeCopy, seo } from "@/lib/woodright-copy"

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
        <p>{homeCopy.hero.lead}</p>
        <div className="hero-actions">
          <Link href="/catalog" className="btn btn-primary">{homeCopy.hero.ctaPrimary}</Link>
          <Link href="/rooms" className="btn btn-secondary">{homeCopy.hero.ctaSecondary}</Link>
        </div>
        <div className="hero-chips">
          {homeCopy.hero.chips.map((chip) => (
            <span className="hero-chip" key={chip}>{chip}</span>
          ))}
        </div>
        <p className="hero-note">{homeCopy.hero.note}</p>
      </div>

      <section className="home-section">
        <h2 className="home-section-title">{homeCopy.quickEntries.title}</h2>
        <div className="home-quick-entries">
          {homeCopy.quickEntries.cards.map((card) => (
            <div className="home-quick-entry" key={card.href}>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
              <Link href={card.href} className="home-quick-entry-link">{card.cta} →</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-text-block">
          <div>
            <h2 className="home-text-block-title">{homeCopy.woodBlock.title}</h2>
            <p className="home-text-block-text">{homeCopy.woodBlock.text}</p>
          </div>
          <ul className="home-text-block-bullets">
            {homeCopy.woodBlock.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-section">
        <div className="home-kids-block">
          <h2 className="home-text-block-title">{homeCopy.kidsBlock.title}</h2>
          <p className="home-text-block-text">{homeCopy.kidsBlock.text}</p>
          <div className="home-text-block-cta">
            <Link href="/kids" className="btn btn-primary">{homeCopy.kidsBlock.cta}</Link>
          </div>
        </div>
      </section>

      <section className="home-section">
        <h2 className="home-text-block-title">{homeCopy.projectBlock.title}</h2>
        <p className="home-text-block-text">{homeCopy.projectBlock.text}</p>
        <div className="home-text-block-cta cta-group">
          <Link href="/bespoke/request" className="btn btn-primary">{homeCopy.projectBlock.ctaPrimary}</Link>
          <Link href="/bespoke/catalog" className="btn btn-secondary">{homeCopy.projectBlock.ctaSecondary}</Link>
        </div>
      </section>

      <section className="home-final-cta">
        <h2 className="home-text-block-title">{homeCopy.finalCta.title}</h2>
        <p>{homeCopy.finalCta.text}</p>
        <Link href="/bespoke/request" className="btn btn-primary">{homeCopy.finalCta.button}</Link>
      </section>
    </div>
  )
}
