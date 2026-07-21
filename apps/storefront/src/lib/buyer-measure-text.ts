const NBSP = "\u202F"
const TIMES = "×"

/** Presentation-only: digit*digit and spaced star separators → ×. */
export function formatBuyerFacingMeasureText(text: string): string {
  return text
    .replace(/(\d)\s*\*\s*(\d)/g, `$1${NBSP}${TIMES}${NBSP}$2`)
    .replace(/(\d)\s+×\s+(\d)/g, `$1${NBSP}${TIMES}${NBSP}$2`)
}
