"use client"

import { useId, useRef, useState, type KeyboardEvent } from "react"
import { wallPanelsCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"
import { wallPanelsMedia, type WallPanelFrame } from "./wall-panels-media"

type MaterialId = keyof typeof wallPanelsMedia.materials

const ITEMS = wallPanelsCopy.materials.items as ReadonlyArray<
  (typeof wallPanelsCopy.materials.items)[number] & { id: MaterialId }
>

/**
 * Material Explorer - a digital material board, not a filter. Desktop: sticky
 * list of directions on the left, a changing two-frame composition (surface +
 * macro / interior) on the right. Mobile: horizontal tab rail, then the same
 * frames stacked. All five texts stay in the DOM (hidden tabpanels) so the
 * content is indexable and readable without JS.
 */
export function WpMaterialExplorer() {
  const copy = wallPanelsCopy.materials
  const [active, setActive] = useState<MaterialId>(ITEMS[0].id)
  const baseId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const activeIndex = ITEMS.findIndex((item) => item.id === active)
  const activeMedia = wallPanelsMedia.materials[active]

  function focusTab(index: number) {
    const next = (index + ITEMS.length) % ITEMS.length
    const item = ITEMS[next]
    setActive(item.id)
    tabRefs.current[next]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault()
        focusTab(index + 1)
        break
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault()
        focusTab(index - 1)
        break
      case "Home":
        e.preventDefault()
        focusTab(0)
        break
      case "End":
        e.preventDefault()
        focusTab(ITEMS.length - 1)
        break
      default:
    }
  }

  return (
    <section id="materials" className="wp-section wp-materials" aria-labelledby="wp-materials-title" data-reveal>
      <header className="wp-sec-head wp-wrap">
        <p className="wp-eyebrow">{copy.eyebrow}</p>
        <h2 id="wp-materials-title" className="wp-sec-title">
          {formatRuInline(copy.title)}
        </h2>
        <CopyLines className="wp-sec-lead" lines={copy.lead} />
      </header>

      <div className="wp-explorer wp-wrap" data-has-alt={activeMedia.alt ? "true" : "false"}>
        <div className="wp-explorer-nav">
          {/* No aria-orientation: the list is vertical ≥900px and a horizontal rail below;
              arrow keys on both axes move the selection. */}
          <div role="tablist" aria-label={copy.a11yTabs} className="wp-explorer-tabs">
            {ITEMS.map((item, i) => {
              const selected = item.id === active
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  className="wp-explorer-tab"
                  data-active={selected ? "true" : "false"}
                  onClick={() => setActive(item.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                >
                  <span className="wp-explorer-tab-index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="wp-explorer-tab-title">{formatRuInline(item.title)}</span>
                  <span className="wp-explorer-tab-short" aria-hidden="true">
                    {item.short}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="wp-explorer-stage">
          <div className="wp-explorer-visual">
            <div className="wp-explorer-main">
              {ITEMS.map((item) => (
                <ExplorerLayer
                  key={item.id}
                  frame={wallPanelsMedia.materials[item.id].main}
                  active={item.id === active}
                />
              ))}
            </div>
            <div className="wp-explorer-alt" aria-hidden={activeMedia.alt ? undefined : true}>
              {ITEMS.map((item) => {
                const alt = wallPanelsMedia.materials[item.id].alt
                if (!alt) return null
                return <ExplorerLayer key={item.id} frame={alt} active={item.id === active} />
              })}
            </div>
          </div>

          {ITEMS.map((item, i) => {
            const selected = item.id === active
            return (
              <div
                key={item.id}
                role="tabpanel"
                id={`${baseId}-panel-${item.id}`}
                aria-labelledby={`${baseId}-tab-${item.id}`}
                hidden={!selected}
                className="wp-explorer-panel"
                data-index={String(i + 1).padStart(2, "0")}
              >
                <h3 className="wp-explorer-panel-title">{formatRuInline(item.title)}</h3>
                <CopyLines className="wp-explorer-panel-text" lines={item.text} />
                <p className="wp-explorer-traits-label">{copy.traitsLabel}</p>
                <ul className="wp-explorer-traits">
                  {item.traits.map((trait) => (
                    <li key={trait}>{formatRuInline(trait)}</li>
                  ))}
                </ul>
              </div>
            )
          })}
          <p className="wp-explorer-counter" aria-hidden="true">
            {String(activeIndex + 1).padStart(2, "0")}
            <span> / </span>
            {String(ITEMS.length).padStart(2, "0")}
          </p>
        </div>
      </div>

      <div className="wp-wrap">
        <CopyLines className="wp-note" lines={copy.note} />
      </div>
    </section>
  )
}

function ExplorerLayer({ frame, active }: { frame: WallPanelFrame; active: boolean }) {
  return (
    <img
      src={frame.src}
      alt={active ? frame.alt : ""}
      style={frame.pos ? { objectPosition: frame.pos } : undefined}
      className="wp-explorer-layer"
      data-active={active ? "true" : "false"}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}
