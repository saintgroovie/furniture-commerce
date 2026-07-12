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
    <div className="bespoke-landing">
      <div className="hero">
        <h1>{bespokeLanding.h1}</h1>
        <CopyLines lines={bespokeLanding.lead} />
        <div className="hero-actions">
          <Link href="/bespoke/request" className="btn btn-primary">{bespokeLanding.ctaPrimary}</Link>
          <Link href="/bespoke/catalog" className="btn btn-secondary">{bespokeLanding.ctaSecondary}</Link>
        </div>
        <CopyLines className="hero-note" lines={bespokeLanding.note} />
      </div>

      <section className="bespoke-section">
        <h2 className="bespoke-section-title">{bespokeLanding.whenTitle}</h2>
        <ul className="bespoke-when-grid">
          {bespokeLanding.whenItems.map((item) => (
            <li className="bespoke-when-card" key={item.title}>
              <h3>{item.title}</h3>
              <CopyLines lines={item.text} />
            </li>
          ))}
        </ul>
      </section>

      <section className="bespoke-section">
        <h2 className="bespoke-section-title">{bespokeLanding.processTitle}</h2>
        <ol className="bespoke-process-grid">
          {bespokeLanding.processSteps.map((step, i) => (
            <li className="bespoke-process-step" key={step.title}>
              <span className="bespoke-process-step-index" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <CopyLines lines={step.text} />
            </li>
          ))}
        </ol>
      </section>

      <section className="bespoke-final-cta">
        <h2 className="bespoke-section-title">{bespokeLanding.finalCta.title}</h2>
        <CopyLines lines={bespokeLanding.finalCta.text} />
        <Link href="/bespoke/request" className="btn btn-primary">{bespokeLanding.finalCta.button}</Link>
      </section>
    </div>
  )
}
