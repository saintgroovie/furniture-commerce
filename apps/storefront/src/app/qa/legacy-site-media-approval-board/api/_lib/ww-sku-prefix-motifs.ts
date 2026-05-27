/**
 * Canonical Willie Winkie SKU article prefix → painting / motif / subcollection.
 * Only listed prefixes are known; unknown prefix → null (do not invent).
 */
export const WW_SKU_PREFIX_MOTIFS: Record<string, string> = {
  av: "Ant's Village",
  ba: "Ballet",
  fa: "Fairies",
  fk: "Fantasy Kingdom",
  in: "Infanta",
  mo: "Molly",
  pa: "Pastoral",
  rl: "Royal Lilies",
  rs: "Rural Scenery",
  sh: "Sweet Home",
  tb: "Teddy Bear",
  te: "Templars",
  to: "Tommy",
  tw: "Tiggy-Winkle",
}

export const WW_SKU_PREFIX_LIST = Object.keys(WW_SKU_PREFIX_MOTIFS)

export function wwHandlePrefix(handle: string): string | null {
  const m = handle.toLowerCase().match(/^([a-z]{2})-\d{2}-\d/)
  return m?.[1] || null
}

export function expectedMotifFromSkuPrefix(handle: string): string | null {
  const prefix = wwHandlePrefix(handle)
  if (!prefix) return null
  return WW_SKU_PREFIX_MOTIFS[prefix] ?? null
}

export function isKnownWwSkuPrefix(prefix: string): boolean {
  return prefix in WW_SKU_PREFIX_MOTIFS
}
