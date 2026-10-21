/** Presentation only. Raw titles and structured dimensions remain unchanged. */
export function withoutHeadingDimensions(title: string): string {
  const number = String.raw`\d+(?:[.,]\d+)?`
  const matrix = String.raw`${number}(?:\s*[×xх*]\s*${number}){1,2}(?:\s*(?:мм|см|mm|cm|м)(?!\p{L}))?`
  return title
    .replace(new RegExp(String.raw`(?:под\s+матрас|спальное\s+место)\s*${matrix}`, "giu"), "")
    .replace(new RegExp(matrix, "giu"), "")
    .replace(new RegExp(String.raw`(?:глубина|ширина|высота|длина|диаметр|гл\.?|шир\.?|выс\.?)\s*[:=]?\s*${number}(?:\s*(?:мм|см|mm|cm|м))?`, "giu"), "")
    .replace(new RegExp(String.raw`[Øø⌀]?\s*${number}\s*(?:мм|см|mm|cm|м)(?!\p{L})`, "giu"), "")
    .replace(/\(\s*\)/gu, "")
    .replace(/\s+([,;)])/gu, "$1")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+/gu, " ")
    .replace(/^[\s,;]+|[\s,;]+$/gu, "")
}
