const KNOWN_TITLE_MOTIFS: string[] = [
  "Fantasy Kingdom",
  "Royal Lilies",
  "Rural Scenery",
  "Teddy Bear",
  "Tiggy-Winkle",
  "Ant's Village",
  "Ant`s Village",
  "Sweet Home",
  "Templars",
  "Fairies",
  "Ballet",
  "Pastoral",
  "Infanta",
  "Molly",
  "Tommy",
]

const FILENAME_COLOR_HINTS: Record<string, string> = {
  blue: "синяя роспись (файл)",
  grey: "серая роспись (файл)",
  gray: "серая роспись (файл)",
  olive: "оливковая роспись (файл)",
  shared: "общий файл (цвет не различён)",
}

function motifVariants(motif: string): string[] {
  const base = motif.replace(/[`']/g, "'").trim()
  return [...new Set([motif, base, base.replace(/'/g, "`"), base.replace(/'/g, "'")])]
}

export function extractMotifFromTitle(title: string | null | undefined): string | null {
  if (!title?.trim()) return null
  const t = title.replace(/\s+/g, " ")
  for (const motif of KNOWN_TITLE_MOTIFS.sort((a, b) => b.length - a.length)) {
    if (t.toLowerCase().includes(motif.toLowerCase().replace(/`/g, "'"))) {
      return motif.replace(/`/g, "'")
    }
  }
  const latin = t.match(
    /(?:комод|стол|стеллаж|кровать|туалетный|рабочий|детский|стандарт|высокий|для книг)[^A-Za-z]*([A-Z][A-Za-z''\-\s]+?)(?:\s*\(гл\.|$)/i
  )?.[1]
  if (latin && latin.length > 2 && latin.length < 40) {
    return latin.trim().replace(/\s+/g, " ")
  }
  return null
}

export function findMotifInTitle(title: string, expectedMotif?: string | null): string | null {
  const fromTitle = extractMotifFromTitle(title)
  if (fromTitle) return fromTitle
  if (!expectedMotif) return null
  const norm = title.toLowerCase().replace(/[`']/g, "'")
  for (const v of motifVariants(expectedMotif)) {
    if (norm.includes(v.toLowerCase().replace(/[`']/g, "'"))) return expectedMotif
  }
  return null
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
