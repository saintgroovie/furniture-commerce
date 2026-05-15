/**
 * Dev/QA only: decide whether legacy inventory media belongs to the *selected* product,
 * not merely the same color token as another SKU.
 */

import type { CandidateEntry, InvItem } from "./legacy-media-board-types"

export type ProductIdentityTier = "this_sku" | "needs_identity_review" | "excluded"

export type ProductIdentityVerdict = {
  tier: ProductIdentityTier
  reasons: string[]
  /** When set, a stronger foreign product signal was detected. */
  foreignHandle: string | null
  foreignSku: string | null
}

export function normHandle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "").replace(/_/g, "-")
}

export function normSku(s: string): string {
  return normHandle(s)
}

/** Product-like tokens in paths (e.g. co-02-1, oxford-co-02-2). */
export function extractProductTokens(hay: string): string[] {
  const lo = hay.toLowerCase()
  const out = new Set<string>()
  const re = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+){1,4})\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(lo))) {
    const t = normHandle(m[1])
    if (t.length >= 5 && /\d/.test(t)) out.add(t)
  }
  return Array.from(out)
}

function pathContainsToken(hay: string, token: string): boolean {
  if (!token) return false
  const lo = hay.toLowerCase()
  if (lo.includes(token)) return true
  const compact = token.replace(/-/g, "")
  if (compact.length >= 5 && lo.replace(/-/g, "").includes(compact)) return true
  return false
}

/**
 * Classify one inventory row for suggestion / grouping under a selected product.
 * Color-only overlap without handle/SKU identity → excluded or needs review.
 */
export function classifyMediaProductIdentity(
  inv: InvItem,
  ce: CandidateEntry | undefined,
  selectedHandle: string,
  selectedSku: string
): ProductIdentityVerdict {
  const h = normHandle(selectedHandle)
  const sku = normSku(selectedSku)
  const reasons: string[] = []

  const top = ce?.top_candidate
  const topHandle = top?.medusa_product_handle ? normHandle(top.medusa_product_handle) : null
  const topSku = top?.medusa_variant_sku ? normSku(top.medusa_variant_sku) : null

  const invHandle = inv.handle_hint ? normHandle(inv.handle_hint) : null
  const invSku = inv.sku_hint ? normSku(inv.sku_hint) : null

  const pathHay = `${inv.filename} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`
  const pathTokens = extractProductTokens(pathHay)

  const exactHandle =
    invHandle === h ||
    topHandle === h ||
    pathTokens.includes(h) ||
    pathContainsToken(pathHay, h)

  const exactSku =
    Boolean(sku) &&
    (invSku === sku ||
      topSku === sku ||
      pathTokens.includes(sku) ||
      pathContainsToken(pathHay, sku))

  const candidateExact = (ce?.candidates ?? []).some(
    (c) => normHandle(c.medusa_product_handle) === h || (sku && normSku(c.medusa_variant_sku) === sku)
  )

  const topIsSelected = topHandle === h || (sku && topSku === sku)

  const foreignHandles = new Set<string>()
  const foreignSkus = new Set<string>()
  if (topHandle && topHandle !== h) foreignHandles.add(topHandle)
  if (topSku && sku && topSku !== sku) foreignSkus.add(topSku)
  if (invHandle && invHandle !== h) foreignHandles.add(invHandle)
  if (invSku && sku && invSku !== sku) foreignSkus.add(invSku)
  for (const t of pathTokens) {
    if (t !== h && t !== sku) {
      if (t.includes("-") && /\d/.test(t)) foreignHandles.add(t)
    }
  }

  const foreignHandle = foreignHandles.size ? Array.from(foreignHandles)[0] : null
  const foreignSku = foreignSkus.size ? Array.from(foreignSkus)[0] : null

  if (exactHandle || exactSku) {
    if (foreignHandle && foreignHandle !== h && !topIsSelected && invHandle !== h) {
      return {
        tier: "needs_identity_review",
        reasons: [
          `path/hints mention ${foreignHandle}`,
          `selected handle ${h}`,
          "excluded: other handle in filename/path",
        ],
        foreignHandle,
        foreignSku,
      }
    }
    if (foreignSku && foreignSku !== sku && !exactSku && invSku !== sku) {
      return {
        tier: "needs_identity_review",
        reasons: [`sku hint ${foreignSku} ≠ selected ${sku}`, "excluded: other sku in hints"],
        foreignHandle,
        foreignSku,
      }
    }
    if (topIsSelected) reasons.push("candidate map top handle/sku match")
    if (invHandle === h) reasons.push("inventory handle_hint match")
    if (invSku === sku) reasons.push("inventory sku_hint match")
    if (pathTokens.includes(h) || pathTokens.includes(sku)) reasons.push("filename/path token match")
    if (candidateExact && !topIsSelected) {
      return {
        tier: "needs_identity_review",
        reasons: [...reasons, "candidate list includes selected product (non-top)"],
        foreignHandle: topHandle,
        foreignSku: topSku,
      }
    }
    return { tier: "this_sku", reasons, foreignHandle: null, foreignSku: null }
  }

  if (candidateExact) {
    return {
      tier: "needs_identity_review",
      reasons: [
        "candidate list includes selected handle (weak)",
        topHandle ? `top candidate is ${topHandle}` : "no top candidate",
      ],
      foreignHandle: topHandle,
      foreignSku: topSku,
    }
  }

  if (foreignHandle || foreignSku) {
    return {
      tier: "excluded",
      reasons: [
        foreignHandle ? `excluded: other handle ${foreignHandle}` : "",
        foreignSku ? `excluded: other sku ${foreignSku}` : "",
        "no exact match for selected product",
      ].filter(Boolean),
      foreignHandle,
      foreignSku,
    }
  }

  if (ce?.identity_confidence === "ambiguous") {
    return {
      tier: "excluded",
      reasons: ["excluded: ambiguous identity, no handle/sku match for selected product"],
      foreignHandle: topHandle,
      foreignSku: topSku,
    }
  }

  return {
    tier: "excluded",
    reasons: ["excluded: color token only — no selected handle/sku signal"],
    foreignHandle: topHandle,
    foreignSku: topSku,
  }
}
