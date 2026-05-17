/**
 * Headless engine proof for co-02-1 visual roles (stdout JSON).
 */
import { buildSuggestedVariantsForProductSync } from "../src/app/qa/legacy-media-assignment-board/legacy-board-sync-rules"
import {
  canBorrowVisualRole,
  FRONT_FAMILY_ROLES,
} from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import type { VisualRole } from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
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
  const roleOf = (id: string | null) => (id ? (s.rolesByMediaId?.[id] ?? null) : null)
  const fileOf = (id: string | null) => (id ? (invById.get(id) as { filename?: string })?.filename ?? id : null)
  const primaryRole = roleOf(s.primaryCandidateId)
  variants[s.label] = {
    variantKey: s.variantKey,
    colorToken: s.colorNameRaw,
    primary: {
      mediaId: s.primaryCandidateId,
      filename: fileOf(s.primaryCandidateId),
      role: primaryRole,
      borrowed: false,
      reason: s.roleCompositionSummary ?? "color-specific primary",
    },
    gallery: s.galleryCandidateIds.map((id) => {
      const borrowed = (s.borrowedSameSku ?? []).find((b) => b.mediaId === id)
      return {
        mediaId: id,
        filename: fileOf(id),
        role: roleOf(id),
        borrowed: Boolean(borrowed),
        borrowedFromVariant: borrowed?.fromVariantLabel ?? null,
        reason: borrowed ? `borrowed ${borrowed.role} from ${borrowed.fromVariantLabel}` : "same-color gallery",
      }
    }),
    borrowedSameSku: (s.borrowedSameSku ?? []).map((b) => ({
      ...b,
      filename: fileOf(b.mediaId),
    })),
    rejectedBorrowCandidates: s.rejectedBorrowCandidates ?? [],
    hiddenDuplicates: s.hiddenDuplicateIds ?? [],
    hiddenDuplicateCount: s.duplicateHiddenCount ?? 0,
    roleStrip: s.roleStrip ?? [],
    primaryIsInterior: primaryRole === "interior",
    primaryIsBorrowed: false,
    hasBorrowedFront: (s.borrowedSameSku ?? []).some((b) =>
      FRONT_FAMILY_ROLES.has(b.role as VisualRole) || b.role === "front_3_4"
    ),
    borrowedRolesOk: (s.borrowedSameSku ?? []).every((b) => canBorrowVisualRole(b.role as VisualRole)),
  }
}

console.log(JSON.stringify({ engine: "buildSuggestedVariantsForProductSync", variants }))
