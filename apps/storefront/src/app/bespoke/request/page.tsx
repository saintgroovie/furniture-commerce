import type { Metadata } from "next"
import { Suspense } from "react"
import { BespokeForm } from "@/components/bespoke-form"
import { ChecklistIcon, MeasureIcon } from "@/components/bespoke-help-icons"
import { CopyLines } from "@/components/copy-lines"
import { bespokeRequestCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.bespokeRequest.title,
  description: seo.bespokeRequest.description,
  openGraph: {
    title: seo.bespokeRequest.title,
    description: seo.bespokeRequest.description,
    url: "/bespoke/request",
  },
}

export default function BespokeRequestPage() {
  return (
    <div className="bespoke-request-page">
      <div className="bespoke-request-header">
        <h1>{bespokeRequestCopy.h1}</h1>
        <CopyLines className="bespoke-request-lead" lines={bespokeRequestCopy.lead} />
      </div>

      <div className="bespoke-request-layout">
        <div className="bespoke-request-card">
          <Suspense fallback={<CopyLines className="info-text" lines="Загружаем форму…" />}>
            <BespokeForm />
          </Suspense>
        </div>

        <aside className="bespoke-request-help">
          <div className="bespoke-request-help-section">
            <div className="bespoke-request-help-section-header">
              <span className="bespoke-request-help-icon">
                <MeasureIcon />
              </span>
              <h2>{bespokeRequestCopy.introTitle}</h2>
            </div>
            <ul className="bespoke-request-help-list">
              {bespokeRequestCopy.introBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>

          <div className="bespoke-request-help-section">
            <div className="bespoke-request-help-section-header">
              <span className="bespoke-request-help-icon">
                <ChecklistIcon />
              </span>
              <h2>{bespokeRequestCopy.nextStepsTitle}</h2>
            </div>
            <ul className="bespoke-request-help-list">
              {bespokeRequestCopy.nextStepsBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>

          <CopyLines className="page-caption" lines={bespokeRequestCopy.introCaption} />
        </aside>
      </div>
    </div>
  )
}
