"use client"

import { useEffect, useRef, useState } from "react"
import { wallPanelsCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"
import { wallPanelsMedia, type WallPanelFrame } from "./wall-panels-media"
import { WpFrame } from "./wp-frame"

type InteriorId = keyof typeof wallPanelsMedia.interior

const STEPS = wallPanelsCopy.interior.steps as ReadonlyArray<
  (typeof wallPanelsCopy.interior.steps)[number] & { id: InteriorId }
>

/**
 * «Панели как часть интерьера»: wall → wall + door → wall + furniture → whole
 * room. Layout is CSS-driven so SSR and hydration render the same tree:
 * desktop (≥900px, motion allowed) shows a sticky image stage while the four
 * steps scroll past it and the step in view drives the frame (crossfade);
 * mobile / reduced motion hides the stage and shows every step with its own
 * frame. JS only picks the active step.
 */
export function WpInterior() {
  const copy = wallPanelsCopy.interior
  const [active, setActive] = useState<InteriorId>(STEPS[0].id)
  const stepRefs = useRef<Array<HTMLLIElement | null>>([])

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return
    const mq = window.matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)")
    let io: IntersectionObserver | null = null

    const connect = () => {
      io?.disconnect()
      io = null
      if (!mq.matches) return
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const id = (entry.target as HTMLElement).dataset.step as InteriorId | undefined
              if (id) setActive(id)
            }
          }
        },
        { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
      )
      stepRefs.current.forEach((el) => el && io?.observe(el))
    }

    connect()
    mq.addEventListener("change", connect)
    return () => {
      mq.removeEventListener("change", connect)
      io?.disconnect()
    }
  }, [])

  return (
    <section id="interior" className="wp-section wp-interior" aria-labelledby="wp-interior-title" data-reveal>
      <header className="wp-sec-head wp-wrap">
        <p className="wp-eyebrow">{copy.eyebrow}</p>
        <h2 id="wp-interior-title" className="wp-sec-title">
          {formatRuInline(copy.title)}
        </h2>
        <CopyLines className="wp-sec-lead" lines={copy.lead} />
      </header>

      <div className="wp-interior-layout wp-wrap">
        <div className="wp-interior-stage" aria-hidden="true">
          {STEPS.map((step) => {
            const frame: WallPanelFrame = wallPanelsMedia.interior[step.id]
            return (
              <img
                key={step.id}
                src={frame.src}
                alt=""
                style={frame.pos ? { objectPosition: frame.pos } : undefined}
                className="wp-interior-layer"
                data-active={step.id === active ? "true" : "false"}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            )
          })}
        </div>

        <ol className="wp-interior-steps">
          {STEPS.map((step, i) => {
            const frame = wallPanelsMedia.interior[step.id]
            return (
              <li
                key={step.id}
                ref={(el) => {
                  stepRefs.current[i] = el
                }}
                data-step={step.id}
                data-active={step.id === active ? "true" : "false"}
                className="wp-interior-step"
              >
                <WpFrame frame={frame} className="wp-interior-frame" />
                <span className="wp-interior-body">
                  <span className="wp-index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{formatRuInline(step.title)}</h3>
                  <p>{formatRuInline(step.text)}</p>
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="wp-wrap">
        <CopyLines className="wp-note" lines={copy.note} />
      </div>
    </section>
  )
}
