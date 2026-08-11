import { bespokeLanding } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { bespokeMedia } from "./bespoke-media"

/**
 * «Как это проходит»: the four existing process steps, each paired with a
 * service photo (measuring, samples, plan, workshop) on a tonal band.
 */
export function BespokeProcess() {
  return (
    <section className="hp-bprocess" aria-labelledby="hp-bprocess-title" data-reveal>
      <div className="hp-bprocess-inner hp-wrap">
        <h2 id="hp-bprocess-title" className="hp-section-title">
          {bespokeLanding.processTitle}
        </h2>
        <ol className="hp-bprocess-grid">
          {bespokeLanding.processSteps.map((step, i) => {
            const media = bespokeMedia.process[i]
            return (
              <li key={step.title} style={{ "--reveal-i": i } as React.CSSProperties}>
                {media && (
                  <span className="hp-bprocess-media">
                    <img
                      src={media.src}
                      alt={media.alt}
                      style={{ objectPosition: media.pos }}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </span>
                )}
                <span className="hp-bprocess-body">
                  <span className="hp-index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{formatRuInline(step.text)}</p>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
