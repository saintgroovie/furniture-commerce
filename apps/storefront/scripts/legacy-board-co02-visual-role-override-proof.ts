/**
 * Proof: co-02-1 visual role overrides + operator labels + optional same-SKU additions.
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { buildSuggestedVariantsForProductSync } from "../src/app/qa/legacy-media-assignment-board/legacy-board-sync-rules"
import {
  classifyVisualRoleDetailed,
  FRONT_FAMILY_ROLES,
  isExternalColorSpecificMedia,
  operatorRoleLabelRu,
  OPERATOR_ROLE_LABEL_RU,
  type VisualRole,
} from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { resolveVisualRoleOverride } from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-overrides"

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

const EXPECTED_LABELS: Record<string, VisualRole> = {
  "co-02-1_gallery_02.jpg": "closed_front",
  "co-02-1_gallery_03.jpg": "front_3_4",
  "co-02-1-iso-1.jpg": "front_anfas",
  "co-02-1-iso-2.jpg": "front_3_4",
  "co-02-1_color_blue_01.jpg": "front_anfas",
  "co-02-1_color_blue_02.jpg": "front_3_4",
  "co-02-1_color_grey_01.jpg": "front_anfas",
  "co-02-1_color_grey_02.jpg": "front_3_4",
  "co-02-1_color_olive_01.jpg": "front_anfas",
  "co-02-1_color_olive_02.jpg": "front_3_4",
}

const roleLabels: Record<string, { role: VisualRole; operatorLabel: string; fromOverride: boolean }> = {}
for (const [basename, expectedRole] of Object.entries(EXPECTED_LABELS)) {
  const it = inv.items.find(
    (row: { filename?: string }) => (row.filename || "").toLowerCase() === basename.toLowerCase()
  )
  if (!it) continue
  const detailed = classifyVisualRoleDetailed(it, { productHandle: HANDLE, productSku: product?.sku })
  roleLabels[basename] = {
    role: detailed.role,
    operatorLabel: operatorRoleLabelRu(detailed.role),
    fromOverride: detailed.fromOverride,
  }
  assert(detailed.role === expectedRole, `Role label mismatch for ${basename}`, {
    expected: expectedRole,
    got: detailed.role,
    operatorLabel: operatorRoleLabelRu(detailed.role),
  })
  assert(
    operatorRoleLabelRu(detailed.role) !== "роль уточнена",
    "Operator label must not be override debug marker",
    { basename }
  )
}

const cream = colorVariants.find((s) => /крем|cream/i.test(s.label))
const blue = colorVariants.find((s) => /син|blue/i.test(s.label))
const grey = colorVariants.find((s) => /сер|grey|gray/i.test(s.label))
const olive = colorVariants.find((s) => /олив|olive/i.test(s.label))

if (cream?.primaryCandidateId) {
  const role = (cream.rolesByMediaId?.[cream.primaryCandidateId] ?? "unknown") as VisualRole
  assert(role !== "interior", "Cream primary must not be interior", { role, filename: fileOf(cream.primaryCandidateId) })
  assert(
    FRONT_FAMILY_ROLES.has(role) || role === "front_3_4",
    "Cream primary must be external closed/front/3-4",
    { role, filename: fileOf(cream.primaryCandidateId) }
  )
  assert(/gallery_02/i.test(fileOf(cream.primaryCandidateId) || ""), "Cream primary should be gallery_02", {
    filename: fileOf(cream.primaryCandidateId),
  })
}

const optionalSameSkuAdditions: Record<string, unknown> = {}
const visibleGallery: Record<string, unknown> = {}

for (const v of [blue, grey, olive, cream].filter(Boolean)) {
  if (!v) continue
  visibleGallery[v.label] = {
    primary: { id: v.primaryCandidateId, filename: fileOf(v.primaryCandidateId), role: v.rolesByMediaId?.[v.primaryCandidateId ?? ""] },
    gallery: v.galleryCandidateIds.map((id) => ({
      id,
      filename: fileOf(id),
      role: v.rolesByMediaId?.[id],
      inGallery: true,
    })),
  }
  const optional = (v.borrowedSameSku ?? []).filter((b) => b.optional)
  optionalSameSkuAdditions[v.label] = optional.map((b) => ({
    mediaId: b.mediaId,
    filename: fileOf(b.mediaId),
    role: b.role,
    operatorLabel: operatorRoleLabelRu(b.role as VisualRole),
    fromVariantLabel: b.fromVariantLabel,
    inGallery: v.galleryCandidateIds.includes(b.mediaId),
  }))

  for (const b of optional) {
    assert(
      !v.galleryCandidateIds.includes(b.mediaId),
      `${v.label} optional borrow must not be in galleryCandidateIds until user adds`,
      { filename: fileOf(b.mediaId) }
    )
  }

  const primaryFn = fileOf(v.primaryCandidateId)
  assert(
    !/cream|gallery_0|iso/i.test(primaryFn || "") || /blue|grey|gray|olive|крем|cream/i.test(v.label),
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
    if (it && /cream|gallery_0|iso/i.test(fn) && !/blue|grey|gray|olive/i.test(fn) && !/крем|cream/i.test(v.label)) {
      const ext = isExternalColorSpecificMedia(it as Parameters<typeof isExternalColorSpecificMedia>[0], {
        role,
        productHandle: HANDLE,
        productSku: product?.sku,
      })
      assert(!ext, `${v.label} gallery has forbidden cream external`, { fn, role })
    }
  }
}

for (const v of [blue, grey, olive].filter(Boolean)) {
  if (!v) continue
  const optionalInterior = (v.borrowedSameSku ?? []).filter((b) => b.optional && b.role === "interior")
  assert(
    optionalInterior.length > 0,
    `${v.label} should offer optional same-SKU interior (e.g. co-02-1-i3)`,
    { borrowed: v.borrowedSameSku }
  )
}

const hiddenTechnicalReasons = Object.entries(roleLabels)
  .filter(([, v]) => v.fromOverride)
  .map(([basename, v]) => ({
    basename,
    operatorLabel: v.operatorLabel,
    uiCardMustNotShow: "роль уточнена",
    detailsMayShow: "visual override",
  }))

assert(
  !Object.values(OPERATOR_ROLE_LABEL_RU).includes("роль уточнена"),
  "Operator role labels must not contain debug override text"
)

const report = {
  auditedAt: new Date().toISOString(),
  roleLabels,
  visibleGallery,
  optionalSameSkuAdditions,
  hiddenTechnicalReasons,
  mismatches,
  ok: mismatches.length === 0,
}

fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, "co-02-1-visual-role-override-proof.json")
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ok: report.ok, outPath, mismatches }, null, 2))
if (!report.ok) process.exit(1)
