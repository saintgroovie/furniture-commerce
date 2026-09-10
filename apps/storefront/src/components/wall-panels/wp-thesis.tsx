import { wallPanelsCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

/**
 * Editorial statement right after the hero + in-page contents. Sets the
 * reading: panel = designed surface, not a shelf item. Contents anchors map to
 * the numbered sections below.
 */
export function WpThesis() {
  const { thesis } = wallPanelsCopy
  return (
    <section className="wp-thesis wp-wrap" aria-label={thesis.lines[0]} data-reveal>
      <CopyLines as="p" className="wp-thesis-text" lines={thesis.lines} />
      <nav className="wp-contents" aria-label={thesis.contentsLabel}>
        <p className="wp-contents-label">{thesis.contentsLabel}</p>
        <ol>
          {thesis.contents.map((item, i) => (
            <li key={item.id} style={{ "--reveal-i": i } as React.CSSProperties}>
              <a href={`#${item.id}`}>
                <span className="wp-contents-index" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  )
}
