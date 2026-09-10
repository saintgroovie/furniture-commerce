import type { CSSProperties } from "react"
import { bespokeLanding } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"

/**
 * «04 · Проекты»: deep-teal plate with four typographic cards (gold index,
 * object, scope, type). No photos until publication rights are confirmed -
 * the footnote says so.
 */
export function BespokeProjects() {
  const { projects } = bespokeLanding
  return (
    <section className="bsp-proj" id="projects" aria-labelledby="bsp-proj-title" data-reveal>
      <div className="bsp-wrap">
        <p className="bsp-eyebrow" id="bsp-proj-title">
          {projects.eyebrow}
        </p>
        <CopyLines as="h2" className="bsp-h2" lines={projects.lead} />
        <ul className="bsp-proj-grid">
          {projects.cards.map((card, i) => (
            <li key={card.title} style={{ "--reveal-i": i } as CSSProperties}>
              <span className="bsp-proj-index" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3>{formatRuInline(card.title)}</h3>
              <p>{formatRuInline(card.text)}</p>
              <span className="bsp-proj-tag">{card.tag}</span>
            </li>
          ))}
        </ul>
        <p className="bsp-proj-foot">{formatRuInline(projects.footnote)}</p>
      </div>
    </section>
  )
}
