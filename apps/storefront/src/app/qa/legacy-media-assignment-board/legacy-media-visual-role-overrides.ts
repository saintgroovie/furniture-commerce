/**
 * QA-only static visual role overrides (legacy board). Not persisted to Medusa/seed/export.
 */

import type { InvItem } from "./legacy-media-board-types"
import { mediaHaystack, type VisualRole } from "./legacy-media-visual-role-ranking"

export type VisualRoleOverride = {
  role: VisualRole
  primaryEligible?: boolean
  borrowable?: boolean
  /** When true, same-SKU borrow is listed as optional (not in visible gallery) if target already has primary + alt front. */
  borrowOptional?: boolean
  colorSpecificExternal?: boolean
  note: string
}

export const VISUAL_ROLE_OVERRIDE_REASON = "override: co-02-1 visual audit"

const CO02_1_OVERRIDES_BY_BASENAME: Record<string, VisualRoleOverride> = {
  "co-02-1_gallery_01.jpg": {
    role: "interior",
    primaryEligible: false,
    borrowable: true,
    borrowOptional: true,
    colorSpecificExternal: true,
    note: "Visual audit: open wardrobe interior (filename gallery_01 is misleading)",
  },
  "co-02-1_gallery_02.jpg": {
    role: "closed_front",
    primaryEligible: true,
    borrowable: false,
    colorSpecificExternal: true,
    note: "Visual audit: closed cream external front — preferred cream primary",
  },
  "co-02-1_gallery_03.jpg": {
    role: "front_3_4",
    primaryEligible: false,
    borrowable: false,
    colorSpecificExternal: true,
    note: "Visual audit: alternate 3/4 external cream shot",
  },
  "co-02-1-i3.jpg": {
    role: "interior",
    primaryEligible: false,
    borrowable: true,
    borrowOptional: true,
    colorSpecificExternal: false,
    note: "Visual audit: shared SKU interior — optional borrow only when color has own front shots",
  },
  "co-02-1-iso-1.jpg": {
    role: "front_3_4",
    primaryEligible: false,
    borrowable: false,
    colorSpecificExternal: true,
    note: "Visual audit: cream-neutral iso 3/4 external",
  },
  "co-02-1-iso-2.jpg": {
    role: "front_3_4",
    primaryEligible: false,
    borrowable: false,
    colorSpecificExternal: true,
    note: "Visual audit: cream-neutral iso 3/4 external",
  },
}

function basenameKey(inv: InvItem): string {
  const hay = mediaHaystack(inv)
  const fromName = (inv.filename || "").trim().toLowerCase()
  if (fromName) return fromName
  const m = hay.match(/([^/\\]+\.(?:jpe?g|png|webp|gif))(?:\?|$)/i)
  return m?.[1]?.toLowerCase() ?? ""
}

export function resolveVisualRoleOverride(
  inv: InvItem,
  opts?: { productHandle?: string; productSku?: string }
): VisualRoleOverride | null {
  const handle = (opts?.productHandle || "").toLowerCase()
  const sku = (opts?.productSku || "").toLowerCase()
  if (handle !== "co-02-1" && sku !== "co-02-1") return null
  const key = basenameKey(inv)
  if (!key) return null
  return CO02_1_OVERRIDES_BY_BASENAME[key] ?? null
}

export function overridePrimaryEligible(inv: InvItem, role: VisualRole, opts?: { productHandle?: string; productSku?: string }): boolean {
  const ov = resolveVisualRoleOverride(inv, opts)
  if (ov?.primaryEligible === false) return false
  if (ov?.primaryEligible === true) {
    return role === "closed_front" || role === "hero_front" || role === "front_anfas"
  }
  return role === "closed_front" || role === "hero_front" || role === "front_anfas"
}

export function overrideBorrowable(inv: InvItem, role: VisualRole, opts?: { productHandle?: string; productSku?: string }): boolean {
  const ov = resolveVisualRoleOverride(inv, opts)
  if (ov?.borrowable === false) return false
  if (ov?.borrowable === true) return role === "interior" || role === "detail" || role === "lifestyle"
  return false
}

export function overrideBorrowOptional(inv: InvItem, opts?: { productHandle?: string; productSku?: string }): boolean {
  return Boolean(resolveVisualRoleOverride(inv, opts)?.borrowOptional)
}

export function overrideColorSpecificExternal(
  inv: InvItem,
  opts?: { productHandle?: string; productSku?: string }
): boolean | null {
  const ov = resolveVisualRoleOverride(inv, opts)
  if (ov?.colorSpecificExternal === undefined) return null
  return ov.colorSpecificExternal
}

/** Boost when picking dedupe cluster canonical (QA overrides). */
export function overrideCanonicalBoost(
  inv: InvItem,
  opts?: { productHandle?: string; productSku?: string }
): number {
  const ov = resolveVisualRoleOverride(inv, opts)
  if (ov?.primaryEligible === true) return 800
  if (ov?.primaryEligible === false) return -600
  return 0
}
