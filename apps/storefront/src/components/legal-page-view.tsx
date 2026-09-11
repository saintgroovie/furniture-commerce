import { Fragment, type ReactNode } from "react"
import type { LegalPageModel } from "@/lib/legal/legal-content"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"
import Link from "next/link"

function sectionId(index: number): string {
  return `section-${index + 1}`
}

/* Legal copy references sibling pages by path («Подробнее: /payment»). The
   strings stay as written (commercial SoT); only the rendering turns the bare
   path into a link with the page name so buyers never see a raw URL. */
const LEGAL_PATH_LABELS: Record<string, string> = {
  "/privacy": "Политика конфиденциальности",
  "/personal-data": "Персональные данные",
  "/cookies": "Cookie",
  "/terms": "Условия покупки",
  "/offer": "Условия продажи",
  "/delivery": "Доставка",
  "/payment": "Оплата",
  "/returns": "Возврат",
  "/warranty": "Гарантия",
  "/requisites": "Реквизиты",
  "/contacts": "Контакты",
}

/* Bare paths only: a preceding letter, digit, ":" "/" "." or "-" means the
   slash belongs to a URL / domain (https://example.ru/payment), not a page. */
const LEGAL_PATH_RE = /(?<![\w:/.-])(\/[a-z][a-z-]*)(?![a-z-])/g

function renderLegalLine(line: string): ReactNode {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of line.matchAll(LEGAL_PATH_RE)) {
    const path = match[1]
    const label = LEGAL_PATH_LABELS[path]
    if (!label || match.index === undefined) continue
    if (match.index > last) {
      nodes.push(formatRuInline(line.slice(last, match.index)))
    }
    nodes.push(
      <Link key={`${match.index}:${path}`} href={path}>
        {label}
      </Link>
    )
    last = match.index + match[0].length
  }
  if (nodes.length === 0) return formatRuInline(line)
  if (last < line.length) nodes.push(formatRuInline(line.slice(last)))
  return nodes
}

function LegalParagraphs({ lines }: { lines: string[] }) {
  return (
    <p>
      {lines.map((line, index) => (
        <Fragment key={`${index}:${line.slice(0, 24)}`}>
          {index > 0 ? (
            <>
              {"\n"}
              <br />
            </>
          ) : null}
          {renderLegalLine(line)}
        </Fragment>
      ))}
    </p>
  )
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
            <LegalParagraphs lines={section.paragraphs} />
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
