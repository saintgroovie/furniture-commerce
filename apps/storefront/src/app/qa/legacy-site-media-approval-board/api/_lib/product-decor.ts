/** Willie Winkie decor/motif resolution (read-only). */

export type DecorSource =
  | "price_list"
  | "seed_products"
  | "normalized"
  | "title_parse"
  | "handle_prefix"
  | "filename_guess"
  | "checklist_color"
  | "unknown"

export type DecorConfidence = "high" | "low" | "unknown"

export type WwTitleParts = {
  product_type_title: string | null
  motif_observed: string | null
  catalog_code_label: string | null
}

export type ProductDecor = {
  is_willie_winkie: boolean
  motif_subcollection: string | null
  motif_subcollection_expected: string | null
  motif_subcollection_observed: string | null
  catalog_code_label: string | null
  motif_source: DecorSource
  motif_confidence: DecorConfidence
  motif_mismatch: boolean
  /** @deprecated use motif_subcollection */
  decor_motif: string | null
  decor_motif_expected: string | null
  decor_motif_observed: string | null
  decor_source: DecorSource
  decor_confidence: DecorConfidence
  decor_mismatch: boolean
}

/** WW SKU prefix → canonical painting/motif name (price-list line families). */
export const WW_HANDLE_PREFIX_MOTIFS: Record<string, string> = {
  av: "Ant's Village",
  ba: "Ballet",
  fa: "Fairies",
  fk: "Fantasy Kingdom",
  in: "Infanta",
  pa: "Pastoral",
  rl: "Royal Lilies",
  rs: "Rural Scenery",
  sh: "Sweet Home",
  tb: "Teddy Bear",
  te: "Templars",
  to: "Tommy",
  tw: "Tiggy-Winkle",
}

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
  "Tommy",
]

const FILENAME_COLOR_HINTS: Record<string, string> = {
  blue: "синяя роспись (файл)",
  grey: "серая роспись (файл)",
  gray: "серая роспись (файл)",
  olive: "оливковая роспись (файл)",
  shared: "общий файл (цвет не различён)",
}

function normalizeMotif(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/['`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function wwHandlePrefix(handle: string): string | null {
  const m = handle.toLowerCase().match(/^([a-z]{2})-\d{2}-\d/)
  return m?.[1] || null
}

export function isWillieWinkieCollection(collection: string | null | undefined): boolean {
  return (collection || "").toLowerCase() === "willie-winkie"
}

export function isWillieWinkieSku(handle: string, collection: string | null | undefined): boolean {
  if (isWillieWinkieCollection(collection)) return true
  const prefix = wwHandlePrefix(handle)
  return Boolean(prefix && WW_HANDLE_PREFIX_MOTIFS[prefix])
}

export function motifFromHandlePrefix(handle: string): string | null {
  const prefix = wwHandlePrefix(handle)
  if (!prefix) return null
  return WW_HANDLE_PREFIX_MOTIFS[prefix] || null
}

export function extractCatalogCodeFromTitle(title: string | null | undefined): string | null {
  if (!title) return null
  const m = title.match(/\(\s*гл\.?\s*(\d+)\s*\)/i)
  return m ? `гл.${m[1]}` : null
}

function motifVariants(motif: string): string[] {
  const base = motif.replace(/[`']/g, "'").trim()
  return [...new Set([motif, base, base.replace(/'/g, "`"), base.replace(/'/g, "'")])]
}

function findMotifInTitle(title: string, expectedMotif?: string | null): string | null {
  const fromTitle = extractMotifFromTitle(title)
  if (fromTitle) return fromTitle
  if (!expectedMotif) return null
  const norm = title.toLowerCase().replace(/[`']/g, "'")
  for (const v of motifVariants(expectedMotif)) {
    if (norm.includes(v.toLowerCase().replace(/[`']/g, "'"))) return expectedMotif
  }
  return null
}

/** Split legacy h1 into product type, motif subcollection, price-list code. */
export function parseWwLegacyTitle(
  title: string | null | undefined,
  expectedMotif?: string | null
): WwTitleParts {
  if (!title?.trim()) {
    return { product_type_title: null, motif_observed: null, catalog_code_label: null }
  }
  const catalog_code_label = extractCatalogCodeFromTitle(title)
  const motif_observed = findMotifInTitle(title, expectedMotif)
  let product_type_title = title.replace(/\s+/g, " ").trim()
  const catalogParen = title.match(/\(\s*гл\.?\s*\d+\s*\)/i)?.[0]
  if (catalogParen) product_type_title = product_type_title.replace(catalogParen, "").trim()
  const stripMotif = motif_observed || expectedMotif
  if (stripMotif) {
    for (const v of motifVariants(stripMotif)) {
      const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      product_type_title = product_type_title.replace(new RegExp(escaped, "i"), "").trim()
    }
  }
  product_type_title = product_type_title.replace(/[,\s·-]+$/g, "").trim()
  return {
    product_type_title: product_type_title || null,
    motif_observed,
    catalog_code_label,
  }
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

export function motifSourceLabel(source: DecorSource): string {
  return decorSourceLabel(source)
}

export function decorSourceLabel(source: DecorSource): string {
  const map: Record<DecorSource, string> = {
    price_list: "price_list",
    seed_products: "seed",
    normalized: "normalized",
    title_parse: "title_parse",
    handle_prefix: "handle_prefix",
    filename_guess: "filename_guess",
    checklist_color: "checklist_color",
    unknown: "unknown",
  }
  return map[source] || source
}

type PickDecorInput = {
  handle: string
  collection: string | null
  productTitle: string | null
  titleSource?: string
  seedDecor?: string | null
  invDecorHint?: string | null
  filename?: string | null
  colorGuess?: string | null
}

export function pickProductDecor(input: PickDecorInput): ProductDecor {
  const isWw = isWillieWinkieSku(input.handle, input.collection)
  const expected = isWw ? motifFromHandlePrefix(input.handle) : null
  const fromFile = decorFromFilename(input.filename)
  const fromColor = decorFromColorGuess(input.colorGuess)

  const titleObserved = findMotifInTitle(input.productTitle || "", expected)
  let source: DecorSource = "unknown"
  let confidence: DecorConfidence = "unknown"

  if (input.seedDecor) {
    source = input.titleSource === "price_list" ? "price_list" : "seed_products"
    confidence = "high"
  } else if (input.invDecorHint) {
    source = "normalized"
    confidence = "high"
  } else if (titleObserved && expected && normalizeMotif(titleObserved) === normalizeMotif(expected)) {
    source = "title_parse"
    confidence = "high"
  } else if (expected) {
    source = "handle_prefix"
    confidence = "high"
  } else if (titleObserved && !expected) {
    source = "title_parse"
    confidence = "high"
  } else if (fromColor) {
    source = "checklist_color"
    confidence = "low"
  } else if (fromFile) {
    source = "filename_guess"
    confidence = "low"
  }

  const mismatch =
    isWw &&
    Boolean(expected && titleObserved) &&
    normalizeMotif(expected) !== normalizeMotif(titleObserved)

  let motifSubcollection: string | null = null
  if (mismatch) {
    source = "title_parse"
    confidence = "high"
  } else if (expected) {
    motifSubcollection = expected
  } else if (titleObserved) {
    motifSubcollection = titleObserved
  } else if (fromColor || fromFile) {
    motifSubcollection = fromColor || fromFile
  }

  return {
    is_willie_winkie: isWw,
    motif_subcollection: motifSubcollection,
    motif_subcollection_expected: expected,
    motif_subcollection_observed: titleObserved,
    catalog_code_label: isWw ? extractCatalogCodeFromTitle(input.productTitle) : null,
    motif_source: isWw && !motifSubcollection && !expected ? "unknown" : source,
    motif_confidence: isWw && !motifSubcollection && !expected ? "unknown" : confidence,
    motif_mismatch: mismatch,
    decor_motif: motifSubcollection,
    decor_motif_expected: expected,
    decor_motif_observed: titleObserved,
    decor_source: isWw && !motifSubcollection && !expected ? "unknown" : source,
    decor_confidence: isWw && !motifSubcollection && !expected ? "unknown" : confidence,
    decor_mismatch: mismatch,
  }
}
