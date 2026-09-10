import { Fragment } from "react"
import Link from "next/link"
import { wallPanelsCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"
import { wallPanelsMedia, WALL_PANELS_REQUEST_HREF } from "./wall-panels-media"

/**
 * Closing scene: dusk room with a dark panelled wall, one project CTA into the
 * existing request flow (section + task prefilled) and a quiet secondary link
 * to contacts. No ecommerce verbs.
 */
export function WpFinal() {
  const copy = wallPanelsCopy.finalCta
  const frame = wallPanelsMedia.final
  return (
    <section className="wp-final" aria-labelledby="wp-final-title" data-reveal>
      <img
        src={frame.src}
        alt={frame.alt}
        className="wp-final-img"
        style={{ objectPosition: frame.pos }}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <div className="wp-final-scrim" aria-hidden="true" />
      <div className="wp-final-body wp-wrap">
        <h2 id="wp-final-title" className="wp-final-title">
          {copy.title.map((line, i) => (
            <Fragment key={line}>
              {i > 0 ? <br /> : null}
              {formatRuInline(line)}
            </Fragment>
          ))}
        </h2>
        <CopyLines className="wp-final-text" lines={copy.text} />
        <div className="wp-final-actions">
          <Link href={WALL_PANELS_REQUEST_HREF} className="btn wp-btn-light">
            {copy.button}
          </Link>
          <Link href="/contacts" className="wp-final-secondary">
            {copy.secondary}
          </Link>
        </div>
      </div>
    </section>
  )
}
