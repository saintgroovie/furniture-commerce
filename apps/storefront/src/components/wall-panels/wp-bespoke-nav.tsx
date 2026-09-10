import Link from "next/link"
import { wallPanelsCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"

/**
 * «Другие возможности Woodright Bespoke»: typographic direction index built
 * from the confirmed Bespoke surfaces only (hub, designers). Designed to take
 * further directions as they appear; the current page is marked, not linked.
 */
export function WpBespokeNav() {
  const copy = wallPanelsCopy.bespokeNav
  return (
    <nav className="wp-bnav wp-wrap" aria-labelledby="wp-bnav-title" data-reveal>
      <h2 id="wp-bnav-title" className="wp-bnav-title">
        {copy.title}
      </h2>
      <ul className="wp-bnav-list">
        {copy.items.map((item, i) => {
          const body = (
            <>
              <span className="wp-bnav-index" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="wp-bnav-body">
                <span className="wp-bnav-item-title">{item.title}</span>
                <span className="wp-bnav-item-text">{formatRuInline(item.text)}</span>
              </span>
              {item.current ? null : (
                <span className="wp-bnav-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </>
          )
          return (
            <li key={item.id} style={{ "--reveal-i": i } as React.CSSProperties}>
              {item.current ? (
                <span className="wp-bnav-item" aria-current="page">
                  {body}
                </span>
              ) : (
                <Link href={item.href} className="wp-bnav-item">
                  {body}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
