/**
 * Auto-pick Primary photo for a color variant from inventory candidates.
 * Prefers front / closed doors; uses filename/path/title hints only (no ML).
 */

import type { InvItem } from "./legacy-media-board-types"

export type PrimaryPickResult = {
  primaryId: string | null
  galleryIds: string[]
  autoPicked: boolean
  needsReview: boolean
  score: number
}

const POSITIVE_HINTS: Array<{ re: RegExp; weight: number }> = [
  { re: /(?:^|[_\-.])(front|frontal|fasad|фасад|фронт)(?:[_\-.]|$)/i, weight: 48 },
  { re: /closed[_\-.]?doors?|doors[_\-.]?closed|закрыт|закрытые/i, weight: 44 },
  { re: /(?:^|[_\-.])(main|hero|primary)(?:[_\-.]|$)/i, weight: 28 },
  { re: /(?:^|[_\-.])i0?1(?:[_\-.]|$)/i, weight: 18 },
  { re: /(?:^|[_\-.])01(?:[_\-.]|$)/i, weight: 14 },
]

const NEGATIVE_HINTS: Array<{ re: RegExp; weight: number }> = [
  { re: /open(?:ed)?|doors[_\-.]?open|открыт/i, weight: 40 },
  { re: /interior|inside|внутр/i, weight: 32 },
  { re: /detail|closeup|крупн/i, weight: 22 },
  { re: /(?:^|[_\-.])(side|back|angle|room|lifestyle|scheme|schema|схем)(?:[_\-.]|$)/i, weight: 26 },
]

function haystackFor(inv: InvItem): string {
  return [inv.filename, inv.source_path, inv.repo_relative_path, inv.url, inv.page_url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function scorePrimaryCandidate(inv: InvItem, orderIndex: number, seedOrderIndex: number | null): number {
  const hay = haystackFor(inv)
  let score = 100 - Math.min(orderIndex, 40)
  if (seedOrderIndex != null) score += Math.max(0, 24 - seedOrderIndex * 4)
  for (const { re, weight } of POSITIVE_HINTS) {
    if (re.test(hay)) score += weight
  }
  for (const { re, weight } of NEGATIVE_HINTS) {
    if (re.test(hay)) score -= weight
  }
  return score
}

export function pickAutoPrimaryForCandidates(
  candidateIds: string[],
  invById: Map<string, InvItem>,
  opts?: { seedOrder?: string[] }
): PrimaryPickResult {
  const unique = Array.from(new Set(candidateIds.filter(Boolean)))
  if (unique.length === 0) {
    return { primaryId: null, galleryIds: [], autoPicked: false, needsReview: true, score: 0 }
  }
  const seedIndex = new Map<string, number>()
  for (let i = 0; i < (opts?.seedOrder?.length ?? 0); i++) {
    const id = opts!.seedOrder![i]
    if (id) seedIndex.set(id, i)
  }

  let bestId = unique[0]
  let bestScore = -Infinity
  for (let i = 0; i < unique.length; i++) {
    const id = unique[i]
    const inv = invById.get(id)
    if (!inv) continue
    const s = scorePrimaryCandidate(inv, i, seedIndex.has(id) ? seedIndex.get(id)! : null)
    if (s > bestScore) {
      bestScore = s
      bestId = id
    }
  }

  const bestInv = invById.get(bestId)
  const hay = bestInv ? haystackFor(bestInv) : ""
  const strongFrontClosed =
    /front|frontal|фасад|фронт/i.test(hay) &&
    (/closed|закрыт/i.test(hay) || !/open|открыт/i.test(hay))
  const needsReview = !strongFrontClosed && bestScore < 120

  const galleryIds = unique.filter((id) => id !== bestId)
  return {
    primaryId: bestId,
    galleryIds,
    autoPicked: true,
    needsReview,
    score: bestScore,
  }
}
