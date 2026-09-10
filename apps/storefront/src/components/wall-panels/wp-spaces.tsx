import { wallPanelsCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { wallPanelsMedia } from "./wall-panels-media"
import { WpFrame } from "./wp-frame"

type SpaceId = keyof typeof wallPanelsMedia.spaces

/**
 * «Для разных пространств»: four scenes in an asymmetric editorial grid
 * (8/4 then 5/7 columns). Captions sit under the frames, not on them, so the
 * interiors read as photographs.
 */
export function WpSpaces() {
  const copy = wallPanelsCopy.spaces
  return (
    <section id="spaces" className="wp-section wp-spaces" aria-labelledby="wp-spaces-title" data-reveal>
      <header className="wp-sec-head wp-wrap">
        <p className="wp-eyebrow">{copy.eyebrow}</p>
        <h2 id="wp-spaces-title" className="wp-sec-title">
          {formatRuInline(copy.title)}
        </h2>
      </header>

      <ul className="wp-spaces-grid wp-wrap">
        {copy.items.map((item, i) => {
          const frame = wallPanelsMedia.spaces[item.id as SpaceId]
          return (
            <li
              key={item.id}
              className="wp-spaces-item"
              data-space={item.id}
              style={{ "--reveal-i": i } as React.CSSProperties}
            >
              <WpFrame frame={frame} className="wp-spaces-frame" ratio="none" />
              <span className="wp-spaces-caption">
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
