import type { CSSProperties } from "react"
import { bespokeLanding } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"

/** «02 · Когда это Bespoke»: catalogue → PDP options → Bespoke, three blocks. */
export function BespokeBoundary() {
  const { boundary, lead } = bespokeLanding
  return (
    <section className="bsp-section bsp-wrap" aria-labelledby="bsp-boundary-title" data-reveal>
      <p className="bsp-eyebrow">{boundary.eyebrow}</p>
      <h2 id="bsp-boundary-title" className="bsp-h2">
        {formatRuInline(boundary.title)}
      </h2>
      <CopyLines className="bsp-lead" lines={lead} />
      <ul className="bsp-bound">
        {boundary.items.map((item, i) => (
          <li
            key={item.index}
            className={item.accent ? "is-bsp" : undefined}
            style={{ "--reveal-i": i } as CSSProperties}
          >
            <span className="bsp-bound-index">{item.index}</span>
            <h3>{formatRuInline(item.title)}</h3>
            <p>{formatRuInline(item.text)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
