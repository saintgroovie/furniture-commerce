/** Presentation only. Raw titles and structured dimensions remain unchanged. */

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
const MATRIX = String.raw`${NUMBER}(?:\s*[×xх*]\s*${NUMBER}){1,2}(?:\s*(?:мм|см|mm|cm|м)(?!\p{L}))?`

export type ExtractedHeadingSpan = {
  raw: string
  role: "sleeping_place" | "body_matrix" | "axis" | "measure"
}

function take(source: string, pattern: string, flags: string): { next: string; hits: string[] } {
  const hits: string[] = []
  const next = source.replace(new RegExp(pattern, flags), (match) => {
    const raw = match.trim()
    if (raw) hits.push(raw)
    return ""
  })
  return { next, hits }
}

function finishHeading(title: string): string {
  return title
    .replace(/\(\s*\)/gu, "")
    .replace(/\s+([,;)])/gu, "$1")
    .replace(/\(\s+/gu, "(")
    .replace(/,\s*,+/gu, ",")
    .replace(/\s+/gu, " ")
    .replace(/^[\s,;]+|[\s,;]+$/gu, "")
}

/**
 * Same removals as `withoutHeadingDimensions`, plus the spans that were removed.
 * A two-number matrix is a sleeping place only when the source title is a bed
 * or already says so. It is never derived from body height/width/depth.
 */
export function splitHeadingDimensions(
  title: string,
  options?: { bed?: boolean }
): { title: string; extracted: ExtractedHeadingSpan[] } {
  const extracted: ExtractedHeadingSpan[] = []
  const bed = options?.bed ?? /кроват/iu.test(title)

  const sleepingLead = take(title, String.raw`(?:под\s+матрас|спальное\s+место)\s*${MATRIX}`, "giu")
  for (const raw of sleepingLead.hits) extracted.push({ raw, role: "sleeping_place" })

  const matrix = take(sleepingLead.next, MATRIX, "giu")
  for (const raw of matrix.hits) {
    const count = raw.match(new RegExp(NUMBER, "gu"))?.length ?? 0
    extracted.push({
      raw,
      role: count === 2 && (bed || sleepingLead.hits.length > 0) ? "sleeping_place" : "body_matrix",
    })
  }

  const axis = take(
    matrix.next,
    String.raw`(?:глубина|ширина|высота|длина|диаметр|гл\.?|шир\.?|выс\.?)\s*[:=]?\s*${NUMBER}(?:\s*(?:мм|см|mm|cm|м))?`,
    "giu"
  )
  for (const raw of axis.hits) extracted.push({ raw, role: "axis" })

  const measure = take(axis.next, String.raw`[Øø⌀]?\s*${NUMBER}\s*(?:мм|см|mm|cm|м)(?!\p{L})`, "giu")
  for (const raw of measure.hits) extracted.push({ raw, role: "measure" })

  return { title: finishHeading(measure.next), extracted }
}

export function withoutHeadingDimensions(title: string): string {
  return splitHeadingDimensions(title).title
}
