import type { LegalPageModel } from "@/lib/legal/legal-content"
import { CopyLines } from "@/components/copy-lines"

/** Shared layout for buyer legal pages - no TODO/PLACEHOLDER chrome. */
export function LegalPageView({ page }: { page: LegalPageModel }) {
  return (
    <main className="container service-page legal-page">
      <header className="service-page-header">
        <h1>{page.title}</h1>
        <CopyLines lines={page.lead} className="service-page-lead" />
      </header>
      {page.sections.map((section) => (
        <section key={section.heading} className="legal-page-section">
          <h2>{section.heading}</h2>
          <CopyLines lines={section.paragraphs} />
        </section>
      ))}
    </main>
  )
}
