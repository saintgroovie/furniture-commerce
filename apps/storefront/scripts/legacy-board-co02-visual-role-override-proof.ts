/**
 * Proof: co-02-1 visual role overrides + suggestion hygiene (engine-level).
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { buildSuggestedVariantsForProductSync } from "../src/app/qa/legacy-media-assignment-board/legacy-board-sync-rules"
import {
  classifyVisualRoleDetailed,
  FRONT_FAMILY_ROLES,
  isExternalColorSpecificMedia,
  type VisualRole,
} from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const outDir = path.join(repoRoot, "tmp/qa-screenshots")

const inv = JSON.parse(fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-inventory.json"), "utf8"))
const candDoc = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-product-candidate-map.json"), "utf8")
)
const prodDoc = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-board-products.json"), "utf8")
)

const HANDLE = "co-02-1"
const candById = new Map(candDoc.entries.map((r: { inventory_id: string }) => [r.inventory_id, r]))
const product = prodDoc.products.find((p: { handle: string }) => String(p.handle).toLowerCase() === HANDLE)
const invById = new Map(inv.items.map((it: { id: string; filename?: string }) => [it.id, it]))

const suggestions = buildSuggestedVariantsForProductSync({
  handle: HANDLE,
  product,
  invItems: inv.items,
  candById,
})

const colorVariants = suggestions.filter(
  (s) => s.identityTier === "this_sku" && !s.variantKey.includes("__review")
)

const mismatches: Array<Record<string, unknown>> = []

function fileOf(id: string | null) {
  return id ? (invById.get(id) as { filename?: string })?.filename ?? id : null
}

function assert(cond: boolean, msg: string, extra: Record<string, unknown> = {}) {
  if (!cond) mismatches.push({ msg, ...extra })
}

const cream = colorVariants.find((s) => /крем|cream/i.test(s.label))
const blue = colorVariants.find((s) => /син|blue/i.test(s.label))
const grey = colorVariants.find((s) => /сер|grey|gray/i.test(s.label))
const olive = colorVariants.find((s) => /олив|olive/i.test(s.label))

if (cream?.primaryCandidateId) {
  const invItem = invById.get(cream.primaryCandidateId)
  const role = (cream.rolesByMediaId?.[cream.primaryCandidateId] ?? "unknown") as VisualRole
  const detailed = invItem
    ? classifyVisualRoleDetailed(invItem as Parameters<typeof classifyVisualRoleDetailed>[0], {
        productHandle: HANDLE,
        productSku: product?.sku,
      })
    : null
  assert(role !== "interior", "Cream primary must not be interior", { role, filename: fileOf(cream.primaryCandidateId) })
  assert(
    FRONT_FAMILY_ROLES.has(role) || role === "front_3_4",
    "Cream primary must be external closed/front/3-4",
    { role, filename: fileOf(cream.primaryCandidateId) }
  )
  assert(
    /gallery_02/i.test(fileOf(cream.primaryCandidateId) || ""),
    "Cream primary should be gallery_02 (closed front override)",
    { filename: fileOf(cream.primaryCandidateId) }
  )
  assert(!detailed || detailed.role !== "interior", "Cream primary classified as interior", {
    filename: fileOf(cream.primaryCandidateId),
  })
}

for (const v of [blue, grey, olive].filter(Boolean)) {
  if (!v) continue
  const primaryFn = fileOf(v.primaryCandidateId)
  assert(
    !/cream|gallery_0|iso/i.test(primaryFn || "") || /blue|grey|gray|olive/i.test(primaryFn || ""),
    `${v.label} primary must be same-color`,
    { primaryFn }
  )
  const visibleBorrowed = (v.borrowedSameSku ?? []).filter((b) => !b.optional)
  for (const b of visibleBorrowed) {
    const fn = (fileOf(b.mediaId) || "").toLowerCase()
    assert(
      !/gallery_0|iso|cream/i.test(fn) || /interior|i3/i.test(fn),
      `${v.label} visible borrow must not be cream external`,
      { fn, role: b.role }
    )
  }
  for (const id of v.galleryCandidateIds) {
    const fn = (fileOf(id) || "").toLowerCase()
    const role = v.rolesByMediaId?.[id] as VisualRole | undefined
    const it = invById.get(id)
    if (it && /cream|gallery_0|iso/i.test(fn) && !/blue|grey|gray|olive/i.test(fn)) {
      const ext = isExternalColorSpecificMedia(it as Parameters<typeof isExternalColorSpecificMedia>[0], {
        role,
        productHandle: HANDLE,
        productSku: product?.sku,
      })
      assert(!ext, `${v.label} gallery has forbidden cream external`, { fn, role })
    }
  }
  for (const id of v.galleryCandidateIds) {
    if ((v.rolesByMediaId?.[id] as VisualRole) !== "interior") continue
    const borrowed = v.borrowedSameSku?.find((b) => b.mediaId === id)
    assert(
      borrowed?.optional,
      `${v.label} borrowed interior in gallery must be optional (not visible)`,
      { filename: fileOf(id) }
    )
  }
}

const report = {
  auditedAt: new Date().toISOString(),
  overridesApplied: [
    "co-02-1_gallery_01.jpg → interior",
    "co-02-1_gallery_02.jpg → closed_front (cream primary)",
    "co-02-1-i3.jpg → interior optional borrow",
  ],
  suggestions: Object.fromEntries(
    colorVariants.map((s) => [
      s.label,
      {
        primary: {
          id: s.primaryCandidateId,
          filename: fileOf(s.primaryCandidateId),
          role: s.rolesByMediaId?.[s.primaryCandidateId ?? ""],
        },
        gallery: s.galleryCandidateIds.map((id) => ({
          id,
          filename: fileOf(id),
          role: s.rolesByMediaId?.[id],
        })),
        borrowedSameSku: s.borrowedSameSku,
      },
    ])
  ),
  ui: { note: "Engine-level; open board on :8000 for visual QA" },
  mismatches,
  ok: mismatches.length === 0,
}

fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, "co-02-1-visual-role-override-proof.json")
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ok: report.ok, outPath, mismatches }, null, 2))
if (!report.ok) process.exit(1)
