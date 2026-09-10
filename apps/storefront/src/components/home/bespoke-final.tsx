import Link from "next/link"
import { bespokeLanding } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { bespokeMedia } from "./bespoke-media"

/** Final CTA plate: deep teal over the hallway photo, lands on the footer rule. */
export function BespokeFinal() {
  const { finalCta } = bespokeLanding
  return (
    <section className="bsp-final" aria-labelledby="bsp-final-title" data-reveal>
      <img
        src={bespokeMedia.final.src}
        alt={bespokeMedia.final.alt}
        className="bsp-final-img"
        style={{ objectPosition: bespokeMedia.final.pos }}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <div className="bsp-final-scrim" aria-hidden="true" />
      <div className="bsp-final-body">
        <span className="bsp-final-line" aria-hidden="true" />
        <h2 id="bsp-final-title">{finalCta.title}</h2>
        <CopyLines className="bsp-final-text" lines={finalCta.text} />
        <Link href="/bespoke/request" className="btn bsp-btn bsp-final-btn">
          {finalCta.button}
        </Link>
      </div>
    </section>
  )
}
