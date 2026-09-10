import Link from "next/link"
import { wallPanelsCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { wallPanelsMedia, WALL_PANELS_REQUEST_HREF } from "./wall-panels-media"
import { WpHeroParallax } from "./wp-hero-parallax"

/**
 * First screen: one interior almost edge to edge, typography set directly on
 * the photo (no card), breadcrumbs + Bespoke marker on top, visual-provenance
 * note in the corner. Secondary CTA scrolls to the material explorer.
 */
export function WpHero() {
  const { hero, breadcrumbs, marker } = wallPanelsCopy
  const frame = wallPanelsMedia.hero
  return (
    <section className="wp-hero" aria-labelledby="wp-hero-title">
      <div className="wp-hero-plate">
        <img
          src={frame.src}
          alt={frame.alt}
          className="wp-hero-img"
          style={{ objectPosition: frame.pos }}
          fetchPriority="high"
          decoding="async"
          draggable={false}
          data-wp-parallax
        />
        <WpHeroParallax />
        <div className="wp-hero-scrim" aria-hidden="true" />

        <div className="wp-hero-top wp-wrap">
          <nav className="wp-breadcrumbs" aria-label="Вы здесь">
            <ol>
              <li>
                <Link href="/bespoke">{breadcrumbs.root}</Link>
              </li>
              <li aria-current="page">{breadcrumbs.current}</li>
            </ol>
          </nav>
          <p className="wp-marker">{marker}</p>
        </div>

        <div className="wp-hero-body wp-wrap">
          <div className="wp-hero-main">
            <h1 id="wp-hero-title" className="wp-hero-title">
              {hero.h1}
            </h1>
            <CopyLines className="wp-hero-lead" lines={hero.lead} />
            <div className="wp-hero-actions">
              <Link href={WALL_PANELS_REQUEST_HREF} className="btn wp-btn-light">
                {hero.ctaPrimary}
              </Link>
              <a href="#materials" className="btn wp-btn-ghost">
                {hero.ctaSecondary}
              </a>
            </div>
          </div>
          <p className="wp-hero-note">{hero.visualsNote}</p>
        </div>
      </div>
    </section>
  )
}
