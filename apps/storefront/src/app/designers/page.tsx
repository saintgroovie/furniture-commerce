import Link from "next/link"
import type { Metadata } from "next"
import { CopyLines } from "@/components/copy-lines"
import { EditorialFigure } from "@/components/editorial/editorial-figure"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { editorialMedia } from "@/lib/editorial-media"
import { formatRuInline } from "@/lib/format-ru-copy"
import { designersLandingCopy, seo } from "@/lib/woodright-copy"

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
    <EditorialShell theme="designers">
      <section className="ed-split ed-split--media-first">
        <EditorialFigure
          className="ed-split-media"
          src={editorialMedia.designersHero.src}
          alt={editorialMedia.designersHero.alt}
        />
        <div className="ed-split-copy">
          <p className="ed-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.h1}</h1>
          <CopyLines className="ed-body" lines={copy.lead} />
        </div>
      </section>

      <section className="ed-wide-media" data-reveal aria-hidden="false">
        <EditorialFigure
          src={editorialMedia.designersWide.src}
          alt={editorialMedia.designersWide.alt}
        />
      </section>

      <section className="ed-scenarios ed-wrap" data-reveal aria-labelledby="designers-scenarios">
        <h2 id="designers-scenarios">{copy.scenariosTitle}</h2>
        <p className="ed-body ed-body--muted">{formatRuInline(copy.benefitsIntro)}</p>
        <ol className="ed-scenario-list">
          {copy.benefits.map((item, index) => (
            <li key={item.lead} className={item.key ? "is-key" : undefined}>
              <span className="ed-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong>{formatRuInline(item.lead)}</strong>
              <span>{formatRuInline(item.rest)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="ed-closing-plate ed-wrap" data-reveal>
        {copy.closing.map((paragraph) => (
          <CopyLines key={paragraph} className="ed-body" lines={paragraph} />
        ))}
        <Link href={copy.ctaHref} className="btn btn-primary">
          {copy.ctaPrimary}
        </Link>
      </section>
    </EditorialShell>
  )
}
