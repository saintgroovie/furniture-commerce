import { wallPanelsCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"

/**
 * «Как начинается проект»: four numbered steps on a tonal band. No timeline,
 * no durations - the wording stays inside SITE_COMMERCIAL_SERVICE_SOT.
 */
export function WpProcess() {
  const copy = wallPanelsCopy.process
  return (
    <section id="process" className="wp-section wp-process" aria-labelledby="wp-process-title" data-reveal>
      <div className="wp-process-inner wp-wrap">
        <header className="wp-sec-head wp-sec-head--tight">
          <p className="wp-eyebrow">{copy.eyebrow}</p>
          <h2 id="wp-process-title" className="wp-sec-title">
            {formatRuInline(copy.title)}
          </h2>
        </header>

        <ol className="wp-process-grid">
          {copy.steps.map((step, i) => (
            <li key={step.title} style={{ "--reveal-i": i } as React.CSSProperties}>
              <span className="wp-process-index" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{formatRuInline(step.text)}</p>
            </li>
          ))}
        </ol>

        <p className="wp-process-note">{formatRuInline(copy.note)}</p>
      </div>
    </section>
  )
}
