import type { LegalPageModel } from "@/lib/legal/legal-content"
import { CopyLines } from "@/components/copy-lines"
import Link from "next/link"

/** Shared layout for buyer legal pages - no TODO/PLACEHOLDER chrome. */
export function LegalPageView({ page }: { page: LegalPageModel }) {
  return (
    <article className="service-page legal-page">
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
      {page.related && page.related.length > 0 ? (
        <nav className="legal-page-related" aria-label="Смежные страницы">
          <ul>
            {page.related.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </article>
  )
}
