import Link from "next/link"
import { homeCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { homeMedia } from "./home-media"
import { HomeHeroSlideshow } from "./home-hero-slideshow"

export function HomeHero() {
  const { hero } = homeCopy
  return (
    <section className="hp-hero" aria-labelledby="hp-hero-title">
      <div className="hp-hero-plate">
        <HomeHeroSlideshow slides={homeMedia.heroSlides} surface="HOME_HERO" />
        <div className="hp-hero-scrim" aria-hidden="true" />
        <div className="hp-hero-panel">
          <h1 id="hp-hero-title">{hero.h1}</h1>
          <CopyLines className="hp-hero-lead" lines={hero.lead} />
          <div className="hp-hero-actions">
            <Link href="/catalog" className="btn btn-primary">
              {hero.ctaPrimary}
            </Link>
            <Link href="/rooms" className="btn btn-secondary">
              {hero.ctaSecondary}
            </Link>
          </div>
        </div>
      </div>

      {/* Editorial strip: the existing chips as indexed markers. */}
      <ul className="hp-hero-markers hp-wrap">
        {hero.chips.map((chip, i) => (
          <li key={chip}>
            <span className="hp-index" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            {chip}
          </li>
        ))}
      </ul>
    </section>
  )
}
