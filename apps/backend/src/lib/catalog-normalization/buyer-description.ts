/**
 * Buyer-safe product description.
 *
 * Recovered price-list rows store operator provenance in `product.description`:
 *   «Стул» / «905 × 480 × 460 мм» / «Порядок: высота, ширина, глубина. Источник - ячейка прайса».
 * None of it is buyer copy: the title echo duplicates the H1, the size line
 * duplicates the specs table, and the provenance lines are internal.
 *
 * Only these exact line shapes are removed. Editorial prose is never rewritten.
 */

/** Shared note appended to every imported description (one sentence, not product-specific). */
export const SHARED_EXECUTION_NOTE = "Есть варианты исполнения - уточним в заявке"

const PROVENANCE_LINE_RES: RegExp[] = [
  /^Порядок:\s*высота,\s*ширина,\s*глубина\.?(?:\s*Источник\s*[-–—]\s*ячейка прайса.*)?$/iu,
  /^Источник\s*[-–—]\s*ячейка прайса.*$/iu,
  /^В названии прайса указан[аоы]?(?::|\s).*$/iu,
]

/** «2400 × 1206 × 645 мм» / «800 × 600 мм» on its own line. */
const DIMENSION_LINE_RE =
  /^\d{2,5}\s*[×xх*]\s*\d{2,5}(?:\s*[×xх*]\s*\d{2,5})?\s*мм\.?$/iu

function normalizeForCompare(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/u, "")
    .trim()
    .toLowerCase()
}

function isSharedNote(line: string): boolean {
  return normalizeForCompare(line) === normalizeForCompare(SHARED_EXECUTION_NOTE)
}

export type BuyerDescriptionOptions = {
  /** Raw Medusa title; a first line equal to it is a title echo. */
  title?: string | null
  /** Drop the shared execution note (SEO snippets / JSON-LD only). */
  dropSharedNote?: boolean
}

export type BuyerDescriptionResult = {
  /** Cleaned description, paragraphs joined with a blank line; null when nothing buyer-facing is left. */
  text: string | null
  removed: Array<"title_echo" | "dimension_line" | "provenance_line" | "shared_note">
}

export function sanitizeBuyerDescription(
  raw: string | null | undefined,
  options: BuyerDescriptionOptions = {}
): BuyerDescriptionResult {
  const removed: BuyerDescriptionResult["removed"] = []
  if (typeof raw !== "string" || !raw.trim()) return { text: null, removed }

  const titleKey = options.title ? normalizeForCompare(options.title) : null
  const paragraphs = raw.replace(/\r\n?/g, "\n").split(/\n{2,}/)
  const kept: string[] = []
  let firstContentLine = true

  for (const paragraph of paragraphs) {
    const lines: string[] = []
    for (const rawLine of paragraph.split("\n")) {
      const line = rawLine.trim()
      if (!line) continue
      const isFirst = firstContentLine
      firstContentLine = false
      if (isFirst && titleKey && normalizeForCompare(line) === titleKey) {
        removed.push("title_echo")
        continue
      }
      if (DIMENSION_LINE_RE.test(line)) {
        removed.push("dimension_line")
        continue
      }
      if (PROVENANCE_LINE_RES.some((re) => re.test(line))) {
        removed.push("provenance_line")
        continue
      }
      if (options.dropSharedNote && isSharedNote(line)) {
        removed.push("shared_note")
        continue
      }
      lines.push(line)
    }
    if (lines.length) kept.push(lines.join("\n"))
  }

  const text = kept.join("\n\n").trim()
  return { text: text || null, removed }
}
