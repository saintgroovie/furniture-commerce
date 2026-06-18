/**
 * Cross-source join helpers: Monchelsea aliases, SKU → handle (seed/workbook).
 * Mirrors scripts/monchelsea_alias.py for storefront QA.
 */

const MN_PREFIX_RE = /^(MNm|MNM|MN)-/i

/** Collapse MN / MNm / MNM to canonical MN- join key. */
export function monchelseaJoinKey(code: string | null | undefined): string | null {
  if (!code || !String(code).trim()) return null
  const c = String(code).trim()
  if (!MN_PREFIX_RE.test(c)) return c.toUpperCase()
  return c.replace(/^MNm-/i, "MN-").replace(/^MNM-/i, "MN-").toUpperCase()
}

export function joinKeyVariants(code: string | null | undefined): string[] {
  const jk = monchelseaJoinKey(code)
  if (!jk) return []
  const out = new Set<string>([jk])
  if (jk.startsWith("MN-")) {
    const tail = jk.slice(3)
    out.add(`MNm-${tail}`)
    out.add(`MNM-${tail}`)
  }
  return Array.from(out)
}

export function normalizeProductCodeForLookup(code: string | null | undefined): string {
  if (!code) return ""
  return monchelseaJoinKey(code) || String(code).trim().toLowerCase()
}

export type SeedCodeIndex = Map<string, string>

/** Build lowercase product_code → medusa_product_handle from seed rows. */
export function buildSeedCodeToHandleIndex(
  products: Array<{ product_code_normalized?: string; medusa_product_handle?: string }>
): SeedCodeIndex {
  const map = new Map<string, string>()
  for (const p of products) {
    const code = p.product_code_normalized
    const handle = p.medusa_product_handle
    if (!code || !handle) continue
    const key = normalizeProductCodeForLookup(code)
    map.set(key, handle.toLowerCase())
    for (const v of joinKeyVariants(code)) {
      map.set(normalizeProductCodeForLookup(v), handle.toLowerCase())
    }
  }
  return map
}

export function resolveHandleFromSkuGuess(
  skuGuess: string | null | undefined,
  index: SeedCodeIndex
): string | null {
  if (!skuGuess) return null
  const raw = skuGuess.trim().toLowerCase()
  if (index.has(raw)) return index.get(raw) ?? null
  const norm = normalizeProductCodeForLookup(skuGuess)
  if (index.has(norm)) return index.get(norm) ?? null
  for (const v of joinKeyVariants(skuGuess)) {
    const h = index.get(normalizeProductCodeForLookup(v))
    if (h) return h
  }
  return null
}
