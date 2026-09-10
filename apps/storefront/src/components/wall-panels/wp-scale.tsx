import { wallPanelsCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"
import { wallPanelsMedia } from "./wall-panels-media"
import { WpFrame } from "./wp-frame"

type ScaleId = keyof typeof wallPanelsMedia.scale

/**
 * «Масштаб»: one oak, one light, one floor - three rhythms read as a single
 * wide wall. The triptych stays three-across on every viewport; only the
 * captions move under the frames. Names are a principle, not presets.
 */
export function WpScale() {
  const copy = wallPanelsCopy.scale
  return (
    <section id="scale" className="wp-section wp-scale" aria-labelledby="wp-scale-title" data-reveal>
      <header className="wp-sec-head wp-wrap">
        <p className="wp-eyebrow">{copy.eyebrow}</p>
        <h2 id="wp-scale-title" className="wp-sec-title">
          {formatRuInline(copy.title)}
        </h2>
        <CopyLines className="wp-sec-lead" lines={copy.lead} />
      </header>

      <ol className="wp-scale-triptych" aria-label={copy.a11yRail}>
        {copy.items.map((item, i) => {
          const frame = wallPanelsMedia.scale[item.id as ScaleId]
          return (
            <li key={item.id} data-scale={item.id} style={{ "--reveal-i": i } as React.CSSProperties}>
              <WpFrame frame={frame} className="wp-scale-frame" ratio="none" />
              <span className="wp-scale-caption">
                <span className="wp-index" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{item.title}</h3>
                <p>{formatRuInline(item.text)}</p>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="wp-wrap">
        <CopyLines className="wp-note" lines={copy.note} />
      </div>
    </section>
  )
}
