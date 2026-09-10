import { wallPanelsCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"
import { wallPanelsMedia } from "./wall-panels-media"
import { WpFrame } from "./wp-frame"

type PatternId = keyof typeof wallPanelsMedia.pattern

/**
 * «Рисунок»: five near-abstract wall fragments. Desktop - dense asymmetric
 * grid (one 2×2 frame + four squares); mobile - horizontal snap rail. Labels
 * sit on the frame: latin editorial mark, Russian title, one-line meaning.
 */
export function WpPattern() {
  const copy = wallPanelsCopy.pattern
  return (
    <section id="pattern" className="wp-section wp-pattern" aria-labelledby="wp-pattern-title" data-reveal>
      <header className="wp-sec-head wp-wrap">
        <p className="wp-eyebrow">{copy.eyebrow}</p>
        <h2 id="wp-pattern-title" className="wp-sec-title">
          {copy.title}
        </h2>
        <CopyLines className="wp-sec-lead" lines={copy.lead} />
      </header>

      <ul className="wp-pattern-grid wp-rail" aria-label={copy.a11yRail}>
        {copy.items.map((item, i) => {
          const frame = wallPanelsMedia.pattern[item.id as PatternId]
          return (
            <li
              key={item.id}
              className="wp-pattern-item"
              data-pattern={item.id}
              style={{ "--reveal-i": i } as React.CSSProperties}
            >
              <WpFrame frame={frame} className="wp-pattern-frame" ratio="none" />
              <span className="wp-pattern-label">
                <span className="wp-latin" aria-hidden="true">
                  {item.latin}
                </span>
                <h3>{item.title}</h3>
                <p>{formatRuInline(item.text)}</p>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
