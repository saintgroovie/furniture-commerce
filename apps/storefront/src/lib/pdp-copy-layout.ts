/**
 * PDP subtitle / description layout only (Woodright UX typography).
 * Dash normalization, meaning-based breaks, and EN proper-name transcription
 * (Woodright / Woodright Kids stay Latin). Wording otherwise unchanged.
 */

import { transcribeEnNamesInRuText } from "@/lib/en-name-ru"

/** Forbidden em/en dashes → Woodright ` - ` (words untouched). */
export function normalizeRuUiDashes(text: string): string {
  return text
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\s*-\s*/g, " - ")
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
  const measureSplit = text.match(/^(.+?)\s-\s(\d[\d\s.,]*см\b.*)$/iu)
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
 * Description body: `\n` paragraphs stay paragraphs; inside each, one
 * sentence = one visual line (scannable lead + supporting), words unchanged.
 */
export function layoutPdpDescription(raw: string): string[][] {
  const text = transcribeEnNamesInRuText(normalizeRuUiDashes(raw))
  if (!text) return []
  return text
    .split(/\n+/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => splitRuSentences(para))
}
