import Link from "next/link"
import { bespokeLanding } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { bespokeMedia } from "./bespoke-media"

/** Bespoke hero: panelled interior photo, existing landing copy and CTAs. */
export function BespokeHero() {
  return (
    <section className="hp-hero" aria-labelledby="hp-bespoke-hero-title">
      <div className="hp-hero-plate hp-bhero-plate">
        <img
          src={bespokeMedia.hero.src}
          alt={bespokeMedia.hero.alt}
          className="hp-hero-img"
          data-slide={0}
          fetchPriority="high"
          decoding="async"
          draggable={false}
        />
        <div className="hp-hero-scrim" aria-hidden="true" />
        <div className="hp-hero-panel">
          <h1 id="hp-bespoke-hero-title">{bespokeLanding.h1}</h1>
          <CopyLines className="hp-hero-lead" lines={bespokeLanding.lead} />
          <div className="hp-hero-actions">
            <Link href="/bespoke/request" className="btn btn-primary">
              {bespokeLanding.ctaPrimary}
            </Link>
            <Link href="/bespoke/catalog" className="btn btn-secondary">
              {bespokeLanding.ctaSecondary}
            </Link>
          </div>
          <CopyLines className="hp-bhero-note" lines={bespokeLanding.note} />
        </div>
      </div>
    </section>
  )
}
