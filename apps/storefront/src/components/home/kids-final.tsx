import Link from "next/link"
import { kidsHome } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"

/** Final CTA on a deep olive band: existing supporting line + bespoke CTA. */
export function KidsFinal() {
  return (
    <section className="hp-kfinal" aria-label={formatRuInline(kidsHome.supporting)} data-reveal>
      <div className="hp-kfinal-body">
        <h2>{formatRuInline(kidsHome.supporting)}</h2>
        <Link href="/bespoke/request" className="btn btn-primary hp-kfinal-btn">
          {kidsHome.ctaBespoke}
        </Link>
      </div>
    </section>
  )
}
