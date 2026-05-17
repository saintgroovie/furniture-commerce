/**
 * Forensic audit: co-02-1 media visual roles + QA overrides → tmp/qa-screenshots JSON.
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { buildSuggestedVariantsForProductSync } from "../src/app/qa/legacy-media-assignment-board/legacy-board-sync-rules"
import {
  classifyVisualRoleDetailed,
  extractColorTokenFromMedia,
  isClearlyBorrowableInteriorOrDetailOrLifestyle,
  isExternalColorSpecificMedia,
  type VisualRole,
} from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import {
  resolveVisualRoleOverride,
  VISUAL_ROLE_OVERRIDE_REASON,
} from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-overrides"
import { mediaHaystack } from "../src/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const outDir = path.join(repoRoot, "tmp/qa-screenshots")
const inv = JSON.parse(fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-inventory.json"), "utf8"))
const candDoc = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-product-candidate-map.json"), "utf8")
)
const prodDoc = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/normalized/legacy-media-board-products.json"), "utf8")
)

type InvRow = {
  id: string
  filename?: string
  source_path?: string
  repo_relative_path?: string
  url?: string
  previewable?: boolean
}

const HANDLE = "co-02-1"
const SKU = "CO-02-1"
const candById = new Map(candDoc.entries.map((r: { inventory_id: string }) => [r.inventory_id, r]))
const product = prodDoc.products.find((p: { handle: string }) => String(p.handle).toLowerCase() === HANDLE)
const invById = new Map(inv.items.map((it: InvRow) => [it.id, it]))

const suggestions = buildSuggestedVariantsForProductSync({
  handle: HANDLE,
  product,
  invItems: inv.items,
  candById,
})

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

const mediaItems = uniqueByFilename(
  inv.items.filter((it: InvRow) => {
    const hay = mediaHaystack(it as Parameters<typeof mediaHaystack>[0])
    return /co-02-1/i.test(hay)
  })
)

const usageByMediaId = new Map<
  string,
  {
    variants: string[]
    asPrimary: string[]
    asGallery: string[]
    borrowedIn: Array<{ variant: string; optional: boolean }>
  }
>()

for (const s of suggestions) {
  if (s.identityTier !== "this_sku" || s.variantKey.includes("__review")) continue
  const label = s.label
  if (s.primaryCandidateId) {
    const u = usageByMediaId.get(s.primaryCandidateId) ?? {
      variants: [],
      asPrimary: [],
      asGallery: [],
      borrowedIn: [],
    }
    u.variants.push(label)
    u.asPrimary.push(label)
    usageByMediaId.set(s.primaryCandidateId, u)
  }
  for (const id of s.galleryCandidateIds) {
    const u = usageByMediaId.get(id) ?? {
      variants: [],
      asPrimary: [],
      asGallery: [],
      borrowedIn: [],
    }
    if (!u.variants.includes(label)) u.variants.push(label)
    u.asGallery.push(label)
    usageByMediaId.set(id, u)
  }
  for (const b of s.borrowedSameSku ?? []) {
    const u = usageByMediaId.get(b.mediaId) ?? {
      variants: [],
      asPrimary: [],
      asGallery: [],
      borrowedIn: [],
    }
    if (!u.variants.includes(label)) u.variants.push(label)
    u.borrowedIn.push({ variant: label, optional: Boolean(b.optional) })
    usageByMediaId.set(b.mediaId, u)
  }
}

const rows = mediaItems.map((it) => {
  const invItem = it as Parameters<typeof classifyVisualRoleDetailed>[0]
  const detailed = classifyVisualRoleDetailed(invItem, { productHandle: HANDLE, productSku: SKU })
  const override = resolveVisualRoleOverride(invItem, { productHandle: HANDLE, productSku: SKU })
  const role = detailed.role
  const colorToken = extractColorTokenFromMedia(invItem, HANDLE, SKU)
  const isExternal = isExternalColorSpecificMedia(invItem, {
    role,
    productHandle: HANDLE,
    productSku: SKU,
  })
  const borrowable =
    role === "interior" || role === "detail" || role === "lifestyle"
      ? isClearlyBorrowableInteriorOrDetailOrLifestyle(invItem, role, { productHandle: HANDLE, productSku: SKU })
      : false
  const usage = usageByMediaId.get(it.id)
  const expectedVisualRole = override?.role ?? null
  const mismatch =
    expectedVisualRole != null &&
    !detailed.fromOverride &&
    role !== expectedVisualRole
  return {
    mediaId: it.id,
    filename: it.filename ?? null,
    source_path: it.source_path ?? null,
    repo_relative_path: it.repo_relative_path ?? null,
    previewUrl: it.url ?? null,
    colorToken,
    currentRole: role,
    currentRoleReasons: detailed.reasons,
    expectedVisualRole,
    mismatch: Boolean(mismatch),
    externalColorSpecificMedia: isExternal,
    borrowable,
    overrideNote: override?.note ?? null,
    usedInSuggestionVariant: usage?.variants ?? [],
    usedAsPrimary: usage?.asPrimary ?? [],
    usedAsGallery: usage?.asGallery ?? [],
    whyUsedAsPrimary:
      usage?.asPrimary.length && usage.asPrimary.length > 0
        ? `primary for ${usage.asPrimary.join(", ")}`
        : null,
    whyBorrowed:
      usage?.borrowedIn.length
        ? usage.borrowedIn.map((b) => `${b.variant}${b.optional ? " (optional)" : ""}`).join("; ")
        : null,
  }
})

const audit = {
  product: HANDLE,
  auditedAt: new Date().toISOString(),
  overrideReason: VISUAL_ROLE_OVERRIDE_REASON,
  mediaCount: rows.length,
  mismatches: rows.filter((r) => r.mismatch),
  rows,
  suggestions: Object.fromEntries(
    suggestions
      .filter((s) => s.identityTier === "this_sku" && !s.variantKey.includes("__review"))
      .map((s) => [
        s.label,
        {
          primary: s.primaryCandidateId,
          primaryFilename: s.primaryCandidateId
            ? (invById.get(s.primaryCandidateId) as InvRow)?.filename
            : null,
          gallery: s.galleryCandidateIds,
          borrowed: s.borrowedSameSku,
        },
      ])
  ),
}

fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, "co-02-1-visual-role-forensic-audit.json")
fs.writeFileSync(outPath, JSON.stringify(audit, null, 2))
console.log(JSON.stringify({ ok: true, outPath, mismatchCount: audit.mismatches.length }, null, 2))
