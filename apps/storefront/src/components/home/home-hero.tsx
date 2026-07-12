import Link from "next/link"
import { homeCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { homeMedia } from "./home-media"

export function HomeHero() {
  const { hero } = homeCopy
  return (
    <section className="hp-hero" aria-labelledby="hp-hero-title">
      <div className="hp-hero-plate">
        {homeMedia.heroSlides.map((slide, i) => (
          <img
            key={slide.src}
            src={slide.src}
            alt={i === 0 ? slide.alt : ""}
            aria-hidden={i === 0 ? undefined : true}
            className="hp-hero-img"
            data-slide={i}
            fetchPriority={i === 0 ? "high" : undefined}
            loading={i === 0 ? undefined : "lazy"}
            decoding="async"
            draggable={false}
          />
        ))}
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
