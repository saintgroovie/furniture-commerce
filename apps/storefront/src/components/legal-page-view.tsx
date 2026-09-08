import type { LegalPageModel } from "@/lib/legal/legal-content"
import { CopyLines } from "@/components/copy-lines"
import Link from "next/link"

function sectionId(index: number): string {
  return `section-${index + 1}`
}

/** Shared layout for buyer legal pages - no TODO/PLACEHOLDER chrome. */
export function LegalPageView({ page }: { page: LegalPageModel }) {
  const showToc = page.sections.length >= 3

  return (
    <article className="service-page legal-page">
      <header className="service-page-header">
        <h1>{page.title}</h1>
        <CopyLines lines={page.lead} className="service-page-lead" />
      </header>
      {showToc ? (
        <nav className="legal-page-toc" aria-label="Содержание">
          <ol>
            {page.sections.map((section, index) => (
              <li key={section.heading}>
                <a href={`#${sectionId(index)}`}>{section.heading}</a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="legal-page-sections">
        {page.sections.map((section, index) => (
          <section
            key={section.heading}
            id={sectionId(index)}
            className="legal-page-section"
          >
            <h2>{section.heading}</h2>
            <CopyLines lines={section.paragraphs} />
          </section>
        ))}
      </div>
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
