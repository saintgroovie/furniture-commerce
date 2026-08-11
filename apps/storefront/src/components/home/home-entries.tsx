import Link from "next/link"
import { homeCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { homeMedia } from "./home-media"
import { HomeImg } from "./home-img"

/* Varied piece types: bed / interior / kids bed / vitrine (no wardrobe row). */
const ENTRY_MEDIA: Record<string, { src: string; alt: string }> = {
  "/catalog": {
    src: homeMedia.entryCatalog,
    alt: "Кровать Greenwich Cloud с мягким изголовьем",
  },
  "/rooms": {
    src: homeMedia.entryRooms,
    alt: "Спальня Cloud с кроватью и рабочим столом",
  },
  "/kids": {
    src: homeMedia.entryKids,
    alt: "Детская кровать Oliver с оливковой росписью",
  },
  "/bespoke": {
    src: homeMedia.entryProject,
    alt: "Шкаф-витрина Greenwich в тёмной отделке",
  },
}

export function HomeEntries() {
  const { quickEntries } = homeCopy
  return (
    <section className="hp-section hp-entries hp-wrap" aria-labelledby="hp-entries-title" data-reveal>
      <h2 id="hp-entries-title" className="hp-section-title">
        {quickEntries.title}
      </h2>
      <div className="hp-entries-grid">
        {quickEntries.cards.map((card, i) => {
          const media = ENTRY_MEDIA[card.href]
          return (
            <Link
              href={card.href}
              className="hp-entry"
              key={card.href}
              data-entry={card.href.replace("/", "") || "home"}
              style={{ "--reveal-i": i } as React.CSSProperties}
            >
              {media && (
                <span className="hp-entry-media">
                  <HomeImg
                    surface="LIFESTYLE_BLOCK"
                    src={media.src}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </span>
              )}
              <span className="hp-entry-body">
                <span className="hp-entry-heading">
                  <span className="hp-index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="hp-entry-title">{card.title}</span>
                </span>
                <CopyLines className="hp-entry-text" lines={card.text} />
                <span className="hp-entry-cta">
                  {card.cta} <span aria-hidden="true">→</span>
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
