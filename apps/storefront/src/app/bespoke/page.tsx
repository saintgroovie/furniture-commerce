import type { Metadata } from "next"
import Link from "next/link"
import { bespokeLanding, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: seo.bespoke.title,
  description: seo.bespoke.description,
  openGraph: {
    title: seo.bespoke.title,
    description: seo.bespoke.description,
    url: "/bespoke",
  },
}

export default function BespokePage() {
  return (
    <div className="service-page">
      <h1>{bespokeLanding.h1}</h1>
      <CopyLines className="info-text" lines={bespokeLanding.lead} />
      <CopyLines className="page-caption" lines={bespokeLanding.supporting} />
      <div className="cta-group">
        <Link href="/bespoke/request" className="btn btn-primary">{bespokeLanding.ctaPrimary}</Link>
        <Link href="/bespoke/catalog" className="btn btn-secondary">{bespokeLanding.ctaSecondary}</Link>
      </div>

      <section>
        <h2>{bespokeLanding.whenTitle}</h2>
        <ul className="bespoke-info-list">
          {bespokeLanding.whenItems.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong> - {item.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{bespokeLanding.processTitle}</h2>
        <ol className="bespoke-process-list">
          {bespokeLanding.processSteps.map((step, i) => (
            <li key={step.title}>
              <span className="bespoke-process-step-index">{i + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <CopyLines lines={step.text} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
