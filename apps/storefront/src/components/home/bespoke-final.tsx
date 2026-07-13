import Link from "next/link"
import { bespokeLanding } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { bespokeMedia } from "./bespoke-media"

/** Final CTA over the panelled-hallway photo, existing finalCta copy. */
export function BespokeFinal() {
  const { finalCta } = bespokeLanding
  return (
    <section className="hp-bfinal" aria-labelledby="hp-bfinal-title" data-reveal>
      <img
        src={bespokeMedia.final.src}
        alt={bespokeMedia.final.alt}
        className="hp-bfinal-img"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <div className="hp-bfinal-scrim" aria-hidden="true" />
      <div className="hp-bfinal-body">
        <h2 id="hp-bfinal-title">{finalCta.title}</h2>
        <CopyLines className="hp-bfinal-text" lines={finalCta.text} />
        <Link href="/bespoke/request" className="btn btn-primary hp-bfinal-btn">
          {finalCta.button}
        </Link>
      </div>
    </section>
  )
}
