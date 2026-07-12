import Link from "next/link"
import { homeCopy, kidsCatalogCopy, kidsHome, roomsCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { kidsMedia } from "./kids-media"

/**
 * «С чего начать» for the kids section: three photo entries built strictly
 * from existing copy (kids catalog lead / kids rooms entry / bespoke card).
 */
const BESPOKE_CARD = homeCopy.quickEntries.cards.find((c) => c.href === "/bespoke")

const ENTRIES = [
  {
    key: "kids-catalog",
    href: "/kids/catalog",
    img: kidsMedia.entryCatalog,
    imgAlt: "Комод Fairies с росписью: бабочки и цветы",
    title: kidsCatalogCopy.h1,
    text: kidsCatalogCopy.lead[0],
    cta: kidsHome.ctaCatalog,
  },
  {
    key: "kids-rooms",
    href: "/kids/rooms",
    img: kidsMedia.entryRooms,
    imgAlt: "Кроватка Oliver Kids для новорождённого",
    title: roomsCopy.kidsEntryTitle,
    text: roomsCopy.kidsEntryText,
    cta: kidsHome.ctaRooms,
  },
  {
    key: "kids-bespoke",
    href: "/bespoke/request",
    img: kidsMedia.entryProject,
    imgAlt: "Стол Royal Lilies в бело-оливковой отделке с росписью",
    title: BESPOKE_CARD?.title ?? "",
    text: typeof BESPOKE_CARD?.text === "string" ? BESPOKE_CARD.text : "",
    cta: kidsHome.ctaBespoke,
  },
]

export function KidsEntries() {
  return (
    <section
      className="hp-section hp-entries hp-wrap"
      aria-labelledby="hp-kids-entries-title"
      data-reveal
    >
      <h2 id="hp-kids-entries-title" className="hp-section-title">
        {homeCopy.quickEntries.title}
      </h2>
      <div className="hp-entries-grid hp-kentries-grid">
        {ENTRIES.map((entry, i) => (
          <Link
            href={entry.href}
            className="hp-entry"
            key={entry.key}
            data-entry={entry.key}
            style={{ "--reveal-i": i } as React.CSSProperties}
          >
            <span className="hp-entry-media">
              <img
                src={entry.img}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </span>
            <span className="hp-entry-body">
              <span className="hp-entry-heading">
                <span className="hp-index" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="hp-entry-title">{entry.title}</span>
              </span>
              <p className="hp-entry-text">{formatRuInline(entry.text)}</p>
              <span className="hp-entry-cta">
                {entry.cta} <span aria-hidden="true">→</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
