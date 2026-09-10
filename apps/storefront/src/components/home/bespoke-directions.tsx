import Link from "next/link"
import type { CSSProperties } from "react"
import { bespokeLanding } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { bespokeMedia, type BespokeFrame } from "./bespoke-media"

/**
 * «03 · Направления»: two photo cards (furniture / wall panels) with a round
 * arrow, then the designers row. Card list is data-driven from copy.
 */
export function BespokeDirections() {
  const { directions, ctaSecondary } = bespokeLanding
  return (
    <section className="bsp-section bsp-wrap" aria-labelledby="bsp-dir-title" data-reveal>
      <p className="bsp-eyebrow">{directions.eyebrow}</p>
      <h2 id="bsp-dir-title" className="bsp-h2">
        {formatRuInline(directions.title)}
      </h2>
      <ul className="bsp-dirs">
        {directions.cards.map((card, i) => {
          const media: BespokeFrame | undefined =
            bespokeMedia.directions[card.id as keyof typeof bespokeMedia.directions]
          return (
            <li key={card.id} style={{ "--reveal-i": i } as CSSProperties}>
              <Link href={card.href} className="bsp-dir">
                {media ? (
                  <img
                    src={media.src}
                    alt=""
                    style={media.pos ? { objectPosition: media.pos } : undefined}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                ) : null}
                <span className="bsp-dir-body">
                  <span className="bsp-dir-copy">
                    <span className="bsp-dir-index" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="bsp-dir-title">{card.title}</span>
                    <span className="bsp-dir-text">{formatRuInline(card.text)}</span>
                  </span>
                  <span className="bsp-dir-arrow" aria-hidden="true">
                    →
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="bsp-dir-row">
        <p>
          <b>{directions.designersRow.title}</b>
          <span>{formatRuInline(directions.designersRow.text)}</span>
        </p>
        <Link href="/designers" className="bsp-dir-row-link">
          {ctaSecondary}
        </Link>
      </div>
    </section>
  )
}
