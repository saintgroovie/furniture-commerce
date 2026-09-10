import { wallPanelsCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"
import { wallPanelsMedia } from "./wall-panels-media"
import { WpFrame } from "./wp-frame"

type DetailId = keyof typeof wallPanelsMedia.details

/**
 * «Архитектура видна в деталях»: a quiet horizontal editorial gallery of
 * macro frames with mixed ratios and a common height. Snap-scrolls on every
 * viewport; the first frame starts at the content edge.
 */
export function WpDetails() {
  const copy = wallPanelsCopy.details
  return (
    <section id="details" className="wp-section wp-details" aria-labelledby="wp-details-title" data-reveal>
      <header className="wp-sec-head wp-wrap">
        <p className="wp-eyebrow">{copy.eyebrow}</p>
        <h2 id="wp-details-title" className="wp-sec-title">
          {formatRuInline(copy.title)}
        </h2>
        <CopyLines className="wp-sec-lead" lines={copy.lead} />
      </header>

      <ul className="wp-details-rail wp-rail" aria-label={copy.a11yRail}>
        {copy.items.map((item, i) => {
          const frame = wallPanelsMedia.details[item.id as DetailId]
          return (
            <li
              key={item.id}
              className="wp-details-item"
              data-ratio={frame.ratio}
              style={{ "--reveal-i": i } as React.CSSProperties}
            >
              <WpFrame frame={frame} className="wp-details-frame" ratio="none" />
              <span className="wp-details-caption">
                <span className="wp-index" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
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
