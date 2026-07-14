/**
 * Runtime near-dup collapse from perceptual analysis evidence.
 * Do not invent filename twins (iso ↔ iso-1) here — only evidence drops/restores.
 */
import collapseArtifact from "./data/media-near-dup-collapse.json"

export type MediaNearDupCollapseEntry = {
  keep_basename: string
  drop_basenames: string[]
  hamming?: number | null
  md5_equal?: boolean
  reason?: string
}

export type MediaNearDupProtectPair = {
  pair: string[]
  hamming?: number | null
  reason?: string
}

type CollapseArtifact = {
  version?: number
  generated_at?: string
  collapse_by_handle: Record<string, MediaNearDupCollapseEntry>
  do_not_collapse?: Record<string, MediaNearDupProtectPair[]>
}

const artifact = collapseArtifact as unknown as CollapseArtifact

function normHandle(handle: string | undefined | null): string {
  return typeof handle === "string" ? handle.trim().toLowerCase() : ""
}

function basenameKey(urlOrBase: string): string {
  const s = urlOrBase.trim()
  return (s.split("/").pop() ?? s).toLowerCase()
}

export function mediaNearDupCollapseForHandle(
  handle: string | undefined | null
): MediaNearDupCollapseEntry | null {
  const key = normHandle(handle)
  if (!key) return null
  return artifact.collapse_by_handle[key] ?? null
}

export function mediaNearDupDropBasenameSet(
  handle: string | undefined | null
): Set<string> {
  const entry = mediaNearDupCollapseForHandle(handle)
  if (!entry) return new Set()
  return new Set(
    (entry.drop_basenames ?? []).map((b) => String(b).toLowerCase())
  )
}

export function mediaNearDupProtectPairsForHandle(
  handle: string | undefined | null
): MediaNearDupProtectPair[] {
  const key = normHandle(handle)
  if (!key) return []
  return artifact.do_not_collapse?.[key] ?? []
}

/**
 * After buyer role-slot collapse, re-attach angles that evidence marked as
 * distinct (e.g. av-05-1 iso ↔ iso-1) when the sibling is still in the raw pool.
 */
export function restoreEvidenceProtectedAngles(
  handle: string | undefined | null,
  orderedUrls: string[],
  fullPool: string[]
): string[] {
  const pairs = mediaNearDupProtectPairsForHandle(handle)
  if (pairs.length === 0) return orderedUrls

  const poolByBase = new Map<string, string>()
  for (const u of fullPool) {
    if (typeof u !== "string" || !u.trim()) continue
    const b = basenameKey(u)
    if (!poolByBase.has(b)) poolByBase.set(b, u.trim())
  }

  const out = [...orderedUrls]
  const present = new Set(out.map(basenameKey))

  for (const entry of pairs) {
    const pair = entry.pair ?? []
    if (pair.length < 2) continue
    const a = pair[0]!
    const b = pair[1]!
    const ba = basenameKey(a)
    const bb = basenameKey(b)
    const hasA = present.has(ba)
    const hasB = present.has(bb)
    if (hasA === hasB) continue
    const missingBase = hasA ? bb : ba
    const presentBase = hasA ? ba : bb
    const missingUrl = poolByBase.get(missingBase)
    if (!missingUrl) continue
    const idx = out.findIndex((u) => basenameKey(u) === presentBase)
    if (idx >= 0) out.splice(idx + 1, 0, missingUrl)
    else out.push(missingUrl)
    present.add(missingBase)
  }

  return out
}
