import Link from "next/link"
import type { CSSProperties } from "react"
import { bespokeLanding } from "@/lib/woodright-copy"
import { BespokeBadge } from "@/components/bespoke-badge"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { formatRuInline } from "@/lib/format-ru-copy"
import { bespokeMedia } from "./bespoke-media"

/**
 * Bespoke hub hero: split 5/7 - editorial text on the section cream, full-height
 * photo on the right. Enter reveal is CSS-only (`.bsp-rise` stagger via --i,
 * clip wipe on the photo, capsule line-draw), gated by prefers-reduced-motion.
 */
export function BespokeHero() {
  const { hero, h1, ctaPrimary } = bespokeLanding
  const rise = (i: number) => ({ "--i": i } as CSSProperties)

  return (
    <section className="bsp-hero" aria-labelledby="bsp-hero-title">
      <div className="bsp-hero-text">
        <p className="bsp-hero-index bsp-rise" style={rise(0)} aria-hidden="true">
          {hero.index}
        </p>
        <p className="bsp-hero-lockup bsp-rise" style={rise(1)} aria-label={h1} role="img">
          <WoodrightWordmark className="bsp-hero-wordmark" />
          <span className="logo-bespoke-slot is-open" aria-hidden="true">
            <BespokeBadge />
          </span>
        </p>
        <h1 id="bsp-hero-title" className="bsp-rise" style={rise(2)}>
          {hero.title[0]}
          <br />
          {hero.title[1]}
        </h1>
        <p className="bsp-hero-lead bsp-rise" style={rise(3)}>
          {formatRuInline(hero.lead)}
        </p>
        <div className="bsp-hero-actions bsp-rise" style={rise(4)}>
          <Link href="/bespoke/request" className="btn btn-primary bsp-btn">
            {ctaPrimary}
          </Link>
          <a href={hero.ctaSecondaryHref} className="btn btn-secondary bsp-btn bsp-btn-secondary">
            {hero.ctaSecondary}
          </a>
        </div>
      </div>
      <div className="bsp-hero-media">
        <img
          src={bespokeMedia.hero.src}
          alt={bespokeMedia.hero.alt}
          style={{ objectPosition: bespokeMedia.hero.pos }}
          fetchPriority="high"
          decoding="async"
          draggable={false}
        />
        <span className="bsp-hero-caption">{hero.caption}</span>
      </div>
    </section>
  )
}
