import Link from "next/link"
import type { LegalPage } from "@/lib/legal-content"

const DRAFT_NOTE = "Раздел в разработке"

/**
 * Shared layout for the 5 legal/policy pages (`.service-page` pattern, same
 * as `/designers/terms` and `/about/production`). Renders `LEGAL_PAGES`
 * sections as-is - do not add copy here, edit `@/lib/legal-content` instead.
 */
export function LegalPageLayout({ page }: { page: LegalPage }) {
  return (
    <div className="service-page">
      <h1>{page.h1}</h1>
      {page.status !== "approved" && <p className="note">{DRAFT_NOTE}</p>}
      <div className="legal-page-sections">
        {page.sections.map((section) => (
          <section key={section.title} className="legal-page-section">
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph, idx) => (
              <p className="info-text" key={idx}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
      <div className="nav-links">
        <Link href="/contacts" className="btn btn-secondary">
          Контакты
        </Link>
        <Link href="/catalog" className="btn btn-secondary">
          Каталог
        </Link>
      </div>
    </div>
  )
}
