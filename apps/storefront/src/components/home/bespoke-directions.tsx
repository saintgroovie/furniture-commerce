import Link from "next/link"
import { bespokeLanding } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"
import { wallPanelsMedia } from "@/components/wall-panels/wall-panels-media"

/** Cover frame per direction id: the direction page's own hero, as its entry card. */
const DIRECTION_MEDIA: Record<string, { src: string; alt: string; pos?: string }> = {
  "wall-panels": wallPanelsMedia.hero,
}

/**
 * «Направления»: entry points into Bespoke direction pages. One wide
 * editorial card per confirmed direction; the list is data-driven so new
 * pages slot in without layout work.
 */
export function BespokeDirections() {
  const { directionsTitle, directionsLead, directions } = bespokeLanding
  if (directions.length === 0) return null
  return (
    <section className="hp-section hp-bdir hp-wrap" aria-labelledby="hp-bdir-title" data-reveal>
      <div className="hp-bdir-head">
        <h2 id="hp-bdir-title" className="hp-section-title">
          {directionsTitle}
        </h2>
        <p className="hp-section-lead">{formatRuInline(directionsLead)}</p>
      </div>
      <ul className="hp-bdir-list">
        {directions.map((item, i) => {
          const media = DIRECTION_MEDIA[item.id]
          return (
            <li key={item.id} style={{ "--reveal-i": i } as React.CSSProperties}>
              <Link href={item.href} className="hp-bdir-card">
                {media ? (
                  <span className="hp-bdir-media">
                    <img
                      src={media.src}
                      alt={media.alt}
                      style={media.pos ? { objectPosition: media.pos } : undefined}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </span>
                ) : null}
                <span className="hp-bdir-body">
                  <span className="hp-index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{item.title}</h3>
                  <CopyLines as="span" className="hp-bdir-text" lines={item.text} />
                  <span className="hp-bdir-cta">
                    {item.cta} <span aria-hidden="true">→</span>
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
