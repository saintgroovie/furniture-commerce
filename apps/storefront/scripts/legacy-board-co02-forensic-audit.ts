/**
 * Forensic audit: co-02-1 media visual roles (stdout JSON table).
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import {
  classifyVisualRole,
  extractColorTokenFromMedia,
  isClearlyBorrowableInteriorOrDetailOrLifestyle,
  isExternalColorSpecificMedia,
  isWardrobeOpenInteriorShot,
  mediaHaystack,
  type VisualRole,
} from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const inv = JSON.parse(fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-inventory.json"), "utf8"))

type InvRow = {
  id: string
  filename?: string
  source_path?: string
  repo_relative_path?: string
  url?: string
  previewable?: boolean
}

function uniqueByFilename(items: InvRow[]): InvRow[] {
  const seen = new Set<string>()
  const out: InvRow[] = []
  for (const it of items.sort((a, b) => a.id.localeCompare(b.id))) {
    const key = (it.filename || it.id).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out.sort((a, b) => (a.filename || "").localeCompare(b.filename || ""))
}

function matchReasons(hay: string, role: VisualRole): string[] {
  const reasons: string[] = []
  if (/[-_]gallery[_\-.]?01/i.test(hay)) reasons.push("gallery_01→closed_front/hero")
  if (/[-_]gallery[_\-.]?02/i.test(hay)) reasons.push("gallery_02→3/4")
  if (/[-_]gallery[_\-.]?03/i.test(hay)) reasons.push("gallery_03→3/4 (not auto-interior)")
  if (/[-_]iso[-_]?\d/i.test(hay)) reasons.push("iso→3/4 external")
  if (/[-_]i0?1(?:\.|[-_]|$)/i.test(hay)) reasons.push("i1→anfas/closed")
  if (/[-_]i0?2(?:\.|[-_]|$)/i.test(hay)) reasons.push("i2→3/4 alternate")
  if (/[-_]i3(?:\.|[-_]|$)/i.test(hay)) reasons.push("i3→interior only if wardrobe/open markers")
  if (/color_[a-z]+_01/i.test(hay)) reasons.push("color_*_01→front")
  if (/color_[a-z]+_02/i.test(hay)) reasons.push("color_*_02→3/4")
  if (role === "interior" && isWardrobeOpenInteriorShot({ filename: hay } as InvRow)) {
    reasons.push("co-02-1-i3 known wardrobe interior")
  }
  return reasons
}

const items = uniqueByFilename(
  inv.items.filter((it: InvRow) => {
    const hay = mediaHaystack(it as Parameters<typeof mediaHaystack>[0])
    return /co-02-1/i.test(hay)
  })
)

const rows = items.map((it) => {
  const invItem = it as Parameters<typeof classifyVisualRole>[0]
  const role = classifyVisualRole(invItem)
  const hay = mediaHaystack(invItem)
  const colorToken = extractColorTokenFromMedia(invItem, "co-02-1", "CO-02-1")
  const isExternal = isExternalColorSpecificMedia(invItem, {
    role,
    productHandle: "co-02-1",
    productSku: "CO-02-1",
  })
  const borrowable =
    role === "interior" || role === "detail" || role === "lifestyle"
      ? isClearlyBorrowableInteriorOrDetailOrLifestyle(invItem, role)
      : false
  return {
    mediaId: it.id,
    filename: it.filename ?? null,
    source_path: it.source_path ?? null,
    repo_relative_path: it.repo_relative_path ?? null,
    previewUrl: it.url ?? null,
    detectedColorToken: colorToken,
    currentRole: role,
    proposedCorrectedRole: role,
    isExternalFrontFamily: isExternal,
    isBorrowable: borrowable,
    why: matchReasons(hay, role).join("; ") || `classified as ${role}`,
    matchedRegex: matchReasons(hay, role),
  }
})

console.log(
  JSON.stringify(
    {
      product: "co-02-1",
      auditedAt: new Date().toISOString(),
      mediaCount: rows.length,
      rows,
    },
    null,
    2
  )
)
