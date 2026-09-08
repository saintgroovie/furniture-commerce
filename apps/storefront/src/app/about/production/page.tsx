import Link from "next/link"
import type { Metadata } from "next"
import { CopyLines } from "@/components/copy-lines"
import { EditorialFigure } from "@/components/editorial/editorial-figure"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { editorialMedia } from "@/lib/editorial-media"
import { formatRuInline } from "@/lib/format-ru-copy"
import { aboutProductionCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.aboutProduction.title,
  description: seo.aboutProduction.description,
  openGraph: {
    title: seo.aboutProduction.title,
    url: "/about/production",
  },
}

const SEQUENCE_MEDIA = [
  editorialMedia.productionWood,
  editorialMedia.productionLead,
  editorialMedia.productionPaint,
] as const

export default function ProductionPage() {
  return (
    <EditorialShell theme="production">
      <div className="ed-sticky ed-wrap">
        <div className="ed-sticky-copy">
          <p className="ed-eyebrow">Производство</p>
          <h1>{aboutProductionCopy.h1}</h1>
          <CopyLines className="ed-body" lines={aboutProductionCopy.lead} />
          <CopyLines className="ed-body ed-body--muted" lines={aboutProductionCopy.body} />
          <div className="ed-cta-row">
            <Link href="/about" className="btn btn-secondary">
              О бренде
            </Link>
            <Link href="/catalog" className="btn btn-primary">
              Каталог
            </Link>
          </div>
        </div>
        <ol className="ed-sequence">
          {aboutProductionCopy.sequence.map((step, index) => (
            <li key={step.title} data-reveal>
              <EditorialFigure
                src={SEQUENCE_MEDIA[index].src}
                alt={SEQUENCE_MEDIA[index].alt}
              />
              <p className="ed-sequence-meta">
                <span className="ed-index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <strong>{formatRuInline(step.title)}</strong>
                <span>{formatRuInline(step.text)}</span>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </EditorialShell>
  )
}
