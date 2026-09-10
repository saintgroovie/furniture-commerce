import type { CSSProperties } from "react"
import { bespokeLanding } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { bespokeMedia, type BespokeFrame } from "./bespoke-media"

/**
 * «05 · Материал и деталь»: tall macro frame + 2×2 grid of material frames,
 * then the budget row (no percentages, per the commercial SoT).
 */
export function BespokeMaterials() {
  const { materials } = bespokeLanding
  return (
    <section className="bsp-section bsp-wrap" aria-labelledby="bsp-mat-title" data-reveal>
      <p className="bsp-eyebrow">{materials.eyebrow}</p>
      <h2 id="bsp-mat-title" className="bsp-h2">
        {formatRuInline(materials.title)}
      </h2>
      <p className="bsp-lead">{formatRuInline(materials.lead)}</p>
      <ul className="bsp-mats">
        {materials.cards.map((card, i) => {
          const media: BespokeFrame | undefined =
            bespokeMedia.materials[card.id as keyof typeof bespokeMedia.materials]
          return (
            <li key={card.id} className="bsp-mat" style={{ "--reveal-i": i } as CSSProperties}>
              {media ? (
                <img
                  src={media.src}
                  alt={media.alt}
                  style={media.pos ? { objectPosition: media.pos } : undefined}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : null}
              <span className="bsp-mat-caption">
                <b>{card.title}</b>
                <span>{formatRuInline(card.text)}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="bsp-budget">
        <b>{materials.budget.label}</b>
        <span>{formatRuInline(materials.budget.text)}</span>
      </p>
    </section>
  )
}
