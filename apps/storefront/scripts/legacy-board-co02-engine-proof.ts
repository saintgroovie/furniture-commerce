/**
 * Headless engine proof for co-02-1 visual roles (stdout JSON).
 */
import { buildSuggestedVariantsForProductSync } from "../src/app/qa/legacy-media-assignment-board/legacy-board-sync-rules"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const inv = JSON.parse(fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-inventory.json"), "utf8"))
const candDoc = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-product-candidate-map.json"), "utf8")
)
const prodDoc = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-board-products.json"), "utf8")
)
const candById = new Map(candDoc.entries.map((r: { inventory_id: string }) => [r.inventory_id, r]))
const product = prodDoc.products.find((p: { handle: string }) => String(p.handle).toLowerCase() === "co-02-1")
const invById = new Map(inv.items.map((it: { id: string }) => [it.id, it]))
const suggestions = buildSuggestedVariantsForProductSync({
  handle: "co-02-1",
  product,
  invItems: inv.items,
  candById,
})

const variants: Record<string, unknown> = {}
for (const s of suggestions.filter(
  (x) => x.identityTier === "this_sku" && !x.variantKey.includes("__review")
)) {
  const roleOf = (id: string | null) => (id ? s.rolesByMediaId?.[id] ?? null : null)
  const fileOf = (id: string | null) => (id ? (invById.get(id) as { filename?: string })?.filename ?? id : null)
  variants[s.label] = {
    variantKey: s.variantKey,
    primary: {
      id: s.primaryCandidateId,
      filename: fileOf(s.primaryCandidateId),
      role: roleOf(s.primaryCandidateId),
    },
    gallery: s.galleryCandidateIds.map((id) => ({
      id,
      filename: fileOf(id),
      role: roleOf(id),
    })),
    borrowedSameSku: (s.borrowedSameSku ?? []).map((b) => ({
      ...b,
      filename: fileOf(b.mediaId),
    })),
    hiddenDuplicateCount: s.duplicateHiddenCount ?? 0,
    roleStrip: s.roleStrip ?? [],
    primaryIsInterior: roleOf(s.primaryCandidateId) === "interior",
  }
}

console.log(JSON.stringify({ engine: "buildSuggestedVariantsForProductSync", variants }))
