/**
 * v2-board-only visual role inference — does not change v1 ranking or backend.
 * Fixes operator-visible mis-tags (gallery_03 / i3 / iso → detail, etc.).
 */

import type { InvItem } from "./legacy-board-v2-types"
import type { V2RoleFilter, V2RoleSlot } from "./legacy-board-v2-types"
import {
  classifyVisualRole,
  type VisualRole,
} from "./legacy-board-v2-visual-role-ranking"

export type V2RoleConfidence = "high" | "low" | "ambiguous"

export type V2InferredRole = {
  role: VisualRole
  confidence: V2RoleConfidence
  /** Human hint for ambiguous / v2 override of legacy auto */
  hint?: string
}

/** Filename patterns treated as detail on v2 board (legacy classifier often → front_3_4). */
const V2_DETAIL_FILENAME_RE =
  /gallery[_-]?0?3(?:\.|[-_]|$)|[-_]i0?3(?:\.|[-_]|$)|[-_]iso[-_]?\d|country_p\d+_i3|[_-]i3[_-]?\d*x\d*/i

/** Third gallery slot / alt angle — legacy may call 3/4; v2 flags as ambiguous front vs detail */
const V2_AMBIGUOUS_34_RE = /gallery[_-]?0?2(?:\.|[-_]|$)|color_[a-z]+_02/i

function haystack(inv: InvItem): string {
  return `${inv.filename || ""} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
}

export function inferV2VisualRole(
  inv: InvItem,
  opts?: { productHandle?: string }
): V2InferredRole {
  const hay = haystack(inv)
  const legacy = classifyVisualRole(inv, { productHandle: opts?.productHandle })

  if (V2_DETAIL_FILENAME_RE.test(hay)) {
    return {
      role: "detail",
      confidence: "high",
      hint: "v2: gallery_03 / i3 / iso → деталь",
    }
  }

  if (V2_AMBIGUOUS_34_RE.test(hay) && legacy === "front_3_4") {
    return {
      role: legacy,
      confidence: "ambiguous",
      hint: "auto? — возможно 3/4 или деталь",
    }
  }

  if (legacy === "unknown") {
    return { role: legacy, confidence: "low", hint: "auto? — роль не определена" }
  }

  return { role: legacy, confidence: "high" }
}

export function visualRoleToV2Filter(role: VisualRole): V2RoleFilter {
  if (role === "closed_front" || role === "hero_front" || role === "front_anfas") return "front"
  if (role === "front_3_4") return "3_4"
  if (role === "interior") return "interior"
  if (role === "detail") return "detail"
  if (role === "lifestyle") return "lifestyle"
  if (role === "scheme") return "scheme"
  return "all"
}

export function roleSlotToV2Filter(slot: V2RoleSlot): V2RoleFilter {
  if (slot === "front_anfas" || slot === "main") return "front"
  if (slot === "front_3_4") return "3_4"
  if (slot === "interior") return "interior"
  if (slot === "detail") return "detail"
  if (slot === "lifestyle") return "lifestyle"
  if (slot === "scheme") return "scheme"
  return "all"
}

/** Effective filter for pool tabs — operator override wins, else v2 inference. */
export function effectiveV2Filter(
  inv: InvItem,
  roleOverrides: Record<string, V2RoleSlot> | undefined,
  opts?: { productHandle?: string }
): V2RoleFilter {
  const override = roleOverrides?.[inv.id]
  if (override) return roleSlotToV2Filter(override)
  return visualRoleToV2Filter(inferV2VisualRole(inv, opts).role)
}

/** Effective slot for role checklist gallery fallback — override wins, else v2-mapped slot. */
export function effectiveV2RoleSlot(
  inv: InvItem,
  roleOverrides: Record<string, V2RoleSlot> | undefined,
  opts?: { productHandle?: string }
): V2RoleSlot | null {
  const override = roleOverrides?.[inv.id]
  if (override) return override
  const role = inferV2VisualRole(inv, opts).role
  if (role === "closed_front" || role === "hero_front" || role === "front_anfas") return "front_anfas"
  if (role === "front_3_4") return "front_3_4"
  if (role === "interior") return "interior"
  if (role === "detail") return "detail"
  if (role === "lifestyle") return "lifestyle"
  if (role === "scheme") return "scheme"
  return null
}
