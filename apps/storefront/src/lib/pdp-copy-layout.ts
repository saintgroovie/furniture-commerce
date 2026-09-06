/**
 * PDP subtitle / description layout only (Woodright UX typography).
 * Dash normalization, meaning-based breaks, and EN proper-name transcription
 * (Woodright / Woodright Kids stay Latin). Wording otherwise unchanged unless
 * punctuation is repaired for scannable line breaks.
 */

import { transcribeEnNamesInRuText } from "@/lib/en-name-ru"

/** Forbidden em/en dashes → Woodright ` - ` (words untouched). */
export function normalizeRuUiDashes(text: string): string {
  return text
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\s*-\s*/g, " - ")
    /* «окна, - где» is a broken bridge: comma + dash. One Woodright dash. */
    .replace(/\s*,\s*-\s+/g, " - ")
    .replace(/ {2,}/g, " ")
    .trim()
}

/**
 * Subtitle under H1: keep words; if the line is «название - N см…»,
 * split into name + measure so wrap never starts a line with «при / по».
 */
export function layoutPdpSubtitle(raw: string): string[] {
  const text = transcribeEnNamesInRuText(normalizeRuUiDashes(raw))
  if (!text) return []
  const measureSplit = text.match(/^(.+?)\s-\s(\d[\d\s.,]*см.*)$/iu)
  if (measureSplit?.[1] && measureSplit[2]) {
    return [measureSplit[1].trim(), measureSplit[2].trim()]
  }
  return [text]
}

/** Split a paragraph into sentences without dropping or reordering words. */
export function splitRuSentences(paragraph: string): string[] {
  const text = paragraph.trim()
  if (!text) return []
  const parts = text.split(/(?<=[.!?…])\s+/u).map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 ? parts : [text]
}

/**
 * Meaning lines inside one sentence for CopyLines (`<br />` between).
 *
 * Why this shape (product place → use → constraint):
 * 1. First line = complete place claim + short zone list.
 * 2. Never split across a dash: in Russian the dash must not end one line
 *    (`окна -` / `где`) and must not start the next (`- где`). Drop the
 *    clause-bridge dash at the break; close the place line with a comma
 *    (`окна,` / `где…`) - the line break carries the pause.
 * 3. Second line = the need («где нужна поверхность…»).
 * 4. Third line = the commercial pivot («но нет глубины…»).
 */
export function layoutDescriptionMeaningLines(sentence: string): string[] {
  const text = normalizeRuUiDashes(sentence.trim())
  if (!text) return []

  const placeWhere = text.match(
    /^(.+?)\s-\s+((?:где|когда|чтобы)\s+.+)$/iu
  )
  if (placeWhere?.[1] && placeWhere[2]) {
    const head = placeWhere[1].replace(/,\s*$/u, "").trim()
    const tail = placeWhere[2].trim()
    const ended = /[.!?…]$/u.test(tail)
    const tailBody = ended ? tail.replace(/[.!?…]$/u, "") : tail
    /* Dash dropped at the break → comma closes the place clause. */
    const placeLine = `${head},`

    const contrast = tailBody.match(/^(.+?),\s+(но\s+.+)$/iu)
    if (contrast?.[1] && contrast[2]) {
      const need = contrast[1].trim().replace(/,\s*$/u, "")
      const but = contrast[2].trim()
      return [placeLine, `${need},`, ended ? `${but}.` : but]
    }

    return [placeLine, ended ? `${tailBody}.` : tailBody]
  }

  return [text]
}

/**
 * Description body: `\n` paragraphs stay paragraphs; inside each, one
 * sentence = one CopyLines block; inside a sentence, meaning lines may
 * split for place → need → constraint (see layoutDescriptionMeaningLines).
 */
export function layoutPdpDescription(raw: string): string[][][] {
  const text = transcribeEnNamesInRuText(normalizeRuUiDashes(raw))
  if (!text) return []
  return text
    .split(/\n+/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) =>
      splitRuSentences(para).map((sentence) => layoutDescriptionMeaningLines(sentence))
    )
}

/**
 * Collection-wide closing voice (finishes range, catalog note) - not SKU body.
 * Product-specific sentences stay the primary description type.
 *
 * Note: JS `\b` is ASCII-only; do not use it around Cyrillic tokens.
 */
export function isPdpCollectionContextSentence(sentence: string): boolean {
  const s = sentence.trim()
  if (!s) return false
  if (/^Выпускается(?:\s|$)/iu.test(s)) return true
  if (/^Доступн[аоые](?:\s|$)/iu.test(s) && /(?:отделк|цвет|исполнен)/iu.test(s)) {
    return true
  }
  if (/^Палитра(?:\s|$)/iu.test(s) && /(?:коллекци|отделк)/iu.test(s)) return true
  if (/палитр\w*\s+коллекци/iu.test(s)) return true
  if (/(?:двенадцати|двенадцать|\d+)\s+отделокк/iu.test(s)) return true
  if (/(?:^|[\s(,.:;])в\s+(?:двенадцати|\d+|[\p{L}\p{N}-]+)\s+отделках(?:\s|$|[.,:;!?…])/iu.test(s)) {
    return true
  }
  if (/от\s+спокойных[\s\S]+(?:тёмн|темн)/iu.test(s)) return true
  return false
}
