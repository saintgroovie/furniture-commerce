import type { CSSProperties } from "react"
import { bespokeLanding } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"

/**
 * «06 · Как идёт работа»: four steps on one hairline, first dot gold.
 * Steps mirror the contract workflow (обращение → состав → спецификация →
 * подтверждение → изготовление) without invented lead times.
 */
export function BespokeProcess() {
  const { process } = bespokeLanding
  return (
    <section className="bsp-section bsp-wrap" id="process" aria-labelledby="bsp-process-title" data-reveal>
      <p className="bsp-eyebrow">{process.eyebrow}</p>
      <h2 id="bsp-process-title" className="bsp-h2">
        {formatRuInline(process.title)}
      </h2>
      <ol className="bsp-steps">
        {process.steps.map((step, i) => (
          <li
            key={step.title}
            className={i === 0 ? "is-gold" : undefined}
            style={{ "--reveal-i": i } as CSSProperties}
          >
            <span className="bsp-step-index" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3>{formatRuInline(step.title)}</h3>
            <p>{formatRuInline(step.text)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
