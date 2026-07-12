import Link from "next/link"
import { homeCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { homeMedia } from "./home-media"

/** Final CTA over a calm wide interior — bookend echo of the hero. */
export function HomeFinal() {
  const { finalCta } = homeCopy
  return (
    <section className="hp-final" aria-labelledby="hp-final-title" data-reveal>
      <img
        src={homeMedia.finalInterior}
        alt=""
        aria-hidden="true"
        className="hp-final-img"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <div className="hp-final-scrim" aria-hidden="true" />
      <div className="hp-final-body">
        <h2 id="hp-final-title">{finalCta.title}</h2>
        <CopyLines className="hp-final-text" lines={finalCta.text} />
        <Link href="/bespoke/request" className="btn btn-primary hp-final-btn">
          {finalCta.button}
        </Link>
      </div>
    </section>
  )
}
