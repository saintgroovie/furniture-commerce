/** Client-safe re-exports for decor hints (no Node fs). */

import type { ChecklistItem, SkuPoolContext } from "./approval-board-types"

const FILENAME_COLOR_HINTS: Record<string, string> = {
  blue: "синяя роспись (файл)",
  grey: "серая роспись (файл)",
  gray: "серая роспись (файл)",
  olive: "оливковая роспись (файл)",
  shared: "общий файл (цвет не различён)",
}

export function isWillieWinkieItem(item: Pick<ChecklistItem, "collection" | "handle">, ctx?: SkuPoolContext): boolean {
  return Boolean(ctx?.is_willie_winkie || item.collection === "willie-winkie")
}

export function decorFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null
  const fn = filename.toLowerCase()
  for (const [key, label] of Object.entries(FILENAME_COLOR_HINTS)) {
    if (fn.includes(`_${key}_`) || fn.includes(`-${key}-`) || fn.includes(`color_${key}`)) {
      return label
    }
  }
  return null
}

export function decorFromColorGuess(colorGuess: string | null | undefined): string | null {
  if (!colorGuess || colorGuess === "unknown") return null
  return FILENAME_COLOR_HINTS[colorGuess.toLowerCase()] || `цвет: ${colorGuess}`
}
