import Link from "next/link"
import { kidsHome } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { kidsMedia } from "./kids-media"
import { HomeHeroSlideshow } from "./home-hero-slideshow"

/** Kids hero: still-life slideshow on a soft olive field (no kids interior
 *  photography exists yet — tracked in kids-media.ts). */
export function KidsHero() {
  return (
    <section className="hp-hero" aria-labelledby="hp-kids-hero-title">
      <div className="hp-hero-plate hp-khero-plate">
        <HomeHeroSlideshow slides={kidsMedia.heroSlides} surface="KIDS_HERO" />
        <div className="hp-hero-panel">
          <h1 id="hp-kids-hero-title">{kidsHome.h1}</h1>
          {/* lead[0] («…ручная роспись») opens the paint gallery below,
              so the hero keeps the other two lines - no text is rewritten. */}
          <CopyLines className="hp-hero-lead" lines={kidsHome.lead.slice(1)} />
          <div className="hp-hero-actions">
            <Link href="/kids/catalog" className="btn btn-primary">
              {kidsHome.ctaCatalog}
            </Link>
            <Link href="/kids/rooms" className="btn btn-secondary">
              {kidsHome.ctaRooms}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
