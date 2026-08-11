import { bespokeLanding } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"

/** «Когда подходит»: four indexed editorial cards, existing copy only. */
export function BespokeWhen() {
  return (
    <section className="hp-section hp-bwhen hp-wrap" aria-labelledby="hp-bwhen-title" data-reveal>
      <h2 id="hp-bwhen-title" className="hp-section-title">
        {bespokeLanding.whenTitle}
      </h2>
      <ul className="hp-bwhen-grid">
        {bespokeLanding.whenItems.map((item, i) => (
          <li key={item.title} style={{ "--reveal-i": i } as React.CSSProperties}>
            <span className="hp-index" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3>{item.title}</h3>
            <p>{formatRuInline(item.text)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
