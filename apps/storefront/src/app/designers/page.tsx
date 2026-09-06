import Link from "next/link"
import type { Metadata } from "next"
import { designersLandingCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"

export const metadata: Metadata = {
  title: seo.designersLanding.title,
  description: seo.designersLanding.description,
  openGraph: {
    title: seo.designersLanding.title,
    description: seo.designersLanding.description,
    url: "/designers",
  },
}

export default function DesignersPage() {
  const copy = designersLandingCopy

  return (
    <article className="designers-page">
      <p className="designers-eyebrow">{copy.eyebrow}</p>
      <h1>{copy.h1}</h1>
      <CopyLines className="designers-lead" lines={copy.lead} />

      <section className="designers-benefits" aria-label={copy.benefitsIntro}>
        <p className="designers-benefits-intro">{copy.benefitsIntro}</p>
        <ul>
          {copy.benefits.map((item) => (
            <li
              key={item.lead}
              className={item.key ? "designers-benefit designers-benefit--key" : "designers-benefit"}
            >
              <strong className="designers-benefit-lead">{formatRuInline(item.lead)}</strong>
              {item.key ? (
                <span className="designers-benefit-rest">{formatRuInline(item.rest)}</span>
              ) : (
                <> {formatRuInline(item.rest)}</>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="designers-closing">
        {copy.closing.map((paragraph) => (
          <CopyLines key={paragraph} className="designers-closing-p" lines={paragraph} />
        ))}
      </div>

      <div className="designers-cta">
        <Link href={copy.ctaHref} className="btn btn-primary">
          {copy.ctaPrimary}
        </Link>
      </div>
    </article>
  )
}
