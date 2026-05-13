/**
 * Dev/QA only: map storefront seed image URLs (seed-products.json) to legacy-media-inventory ids
 * by normalizing static path tails. No Medusa / export shape changes — returns real inventory ids only.
 */

import type { InvItem } from "./legacy-media-board-types"

export type SeedUrlMatchRow = {
  seedUrl: string
  basename: string
  invId: string | null
  invFilename: string | null
  confidence: "high" | "medium" | "low" | "none"
  assignable: boolean
  reason: string
}

/** Normalize to `products/<collection>/…` lowercased path for comparison. */
export function productsRelativeKey(pathOrUrl: string): string {
  let s = String(pathOrUrl || "").trim().split("?")[0].replace(/\\/g, "/")
  s = s.toLowerCase()
  const scheme = s.indexOf("://")
  if (scheme >= 0) {
    const pathStart = s.indexOf("/", scheme + 3)
    s = pathStart >= 0 ? s.slice(pathStart + 1) : s
  }
  s = s.replace(/^\/+/, "")
  if (s.startsWith("static/")) s = s.slice("static/".length)
  s = s.replace(/^apps\/backend\/static\//, "")
  const idx = s.indexOf("products/")
  if (idx >= 0) return s.slice(idx)
  const parts = s.split("/").filter(Boolean)
  return parts.length >= 2 ? parts.slice(-3).join("/") : parts.join("/") || s
}

function basenameOnly(pathOrUrl: string): string {
  const k = productsRelativeKey(pathOrUrl)
  const parts = k.split("/")
  return parts[parts.length - 1] || ""
}

function itemLinkedToProduct(it: InvItem, handleLower: string, skuNorm: string): boolean {
  const hh = (it.handle_hint || "").toLowerCase()
  const sk = (it.sku_hint || "").toLowerCase().replace(/\s+/g, "").replace(/_/g, "-")
  const fn = (it.filename || "").toLowerCase()
  if (hh === handleLower) return true
  if (sk && (sk === handleLower || sk === skuNorm)) return true
  if (skuNorm && fn.includes(skuNorm.replace(/-/g, ""))) return true
  if (fn.includes(handleLower.replace(/-/g, ""))) return true
  return false
}

export function matchSeedUrlToInventory(
  seedUrl: string,
  productHandle: string,
  productSku: string,
  items: InvItem[]
): SeedUrlMatchRow {
  const handleLower = productHandle.toLowerCase()
  const skuNorm = (productSku || "").trim().replace(/\s+/g, "").replace(/_/g, "-").toLowerCase()
  const seedKey = productsRelativeKey(seedUrl)
  const bn = basenameOnly(seedUrl)

  const candidates = items.filter((it) => itemLinkedToProduct(it, handleLower, skuNorm))
  if (candidates.length === 0) {
    return {
      seedUrl,
      basename: bn,
      invId: null,
      invFilename: null,
      confidence: "none",
      assignable: false,
      reason: "No inventory rows linked to this product handle/SKU for filename matching.",
    }
  }

  for (const it of candidates) {
    const invKey = productsRelativeKey(it.repo_relative_path || it.source_path || it.filename || "")
    if (invKey && seedKey && invKey === seedKey) {
      return {
        seedUrl,
        basename: bn,
        invId: it.id,
        invFilename: it.filename,
        confidence: "high",
        assignable: true,
        reason: "Static path tail matches seed URL (products/…/file.jpg).",
      }
    }
  }

  const bnLo = bn.toLowerCase()
  const basenameHits = candidates.filter((it) => (it.filename || "").toLowerCase() === bnLo)
  if (basenameHits.length === 1) {
    const it = basenameHits[0]
    return {
      seedUrl,
      basename: bn,
      invId: it.id,
      invFilename: it.filename,
      confidence: "medium",
      assignable: true,
      reason: "Filename basename matches seed URL; single unambiguous inventory hit.",
    }
  }
  if (basenameHits.length > 1) {
    const sorted = [...basenameHits].sort((a, b) => a.id.localeCompare(b.id))
    const it = sorted[0]
    return {
      seedUrl,
      basename: bn,
      invId: it.id,
      invFilename: it.filename,
      confidence: "low",
      assignable: true,
      reason: `Multiple inventory files share basename ${bn}; picked first stable id (${it.id}).`,
    }
  }

  return {
    seedUrl,
    basename: bn,
    invId: null,
    invFilename: null,
    confidence: "none",
    assignable: false,
    reason: "Seed URL path did not match any repo_relative_path for this product; basename tie-break failed.",
  }
}

/** Ordered unique inventory ids for each seed URL in list order (first wins per id). */
export function orderedInventoryIdsFromSeedUrls(
  seedUrls: string[],
  productHandle: string,
  productSku: string,
  items: InvItem[]
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of seedUrls) {
    const m = matchSeedUrlToInventory(url, productHandle, productSku, items)
    if (m.invId && !seen.has(m.invId)) {
      seen.add(m.invId)
      out.push(m.invId)
    }
  }
  return out
}

export function matchAllSeedUrls(seedUrls: string[], productHandle: string, productSku: string, items: InvItem[]): SeedUrlMatchRow[] {
  return seedUrls.map((u) => matchSeedUrlToInventory(u, productHandle, productSku, items))
}
