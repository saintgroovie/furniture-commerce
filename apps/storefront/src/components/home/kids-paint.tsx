import Link from "next/link"
import { kidsHome, roomsCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { safeInternalHref } from "@/lib/safe-internal-href"
import { kidsMedia } from "./kids-media"

/**
 * Hand-paint gallery: tight crops of the Willie Winkie paint series on a
 * tonal olive band. Copy reuses existing lines only (kids hero lead line +
 * the kids rooms entry text).
 */
export function KidsPaint({ hrefByHandle }: { hrefByHandle: Map<string, string> }) {
  return (
    <section className="hp-paint" aria-labelledby="hp-paint-title" data-reveal>
      <div className="hp-paint-inner hp-wrap">
        <div className="hp-paint-head">
          <h2 id="hp-paint-title" className="hp-section-title">
            {formatRuInline(kidsHome.lead[0])}
          </h2>
          <p className="hp-section-lead">{formatRuInline(roomsCopy.kidsEntryText)}</p>
        </div>
        <ul className="hp-paint-grid">
          {kidsMedia.paint.map((item, i) => {
            const href = safeInternalHref(
              hrefByHandle.get(item.handle),
              "/kids/catalog"
            )
            return (
              <li key={item.handle} style={{ "--reveal-i": i } as React.CSSProperties}>
                <Link href={href} className="hp-paint-item" aria-label={item.alt}>
                  <span className="hp-paint-media">
                    <img
                      src={item.src}
                      alt={item.alt}
                      style={
                        {
                          objectPosition: item.origin,
                          "--paint-zoom": item.zoom,
                        } as React.CSSProperties
                      }
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </span>
                  <span className="hp-paint-index hp-index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
