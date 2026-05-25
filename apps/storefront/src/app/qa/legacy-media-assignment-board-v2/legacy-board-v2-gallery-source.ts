/**
 * Derive gallery ↔ role transparency from rolesByVariant (no extra persisted state).
 */

import { NON_MAIN_ROLE_SLOTS } from "./legacy-board-v2-state-sync"
import type { V2RoleSlot, V2VariantRoleAssignment } from "./legacy-board-v2-types"

export const ROLE_SLOT_LABEL_RU: Record<V2RoleSlot, string> = {
  main: "Главное",
  front_anfas: "Анфас",
  front_3_4: "3/4",
  interior: "Внутри",
  detail: "Деталь",
  lifestyle: "Lifestyle",
  scheme: "Схема",
}

export type GallerySourceKind = "role" | "manual"

export type GallerySourceInfo = {
  kind: GallerySourceKind
  role?: V2RoleSlot
  /** e.g. «из роли: 3/4» */
  label: string
  /** e.g. «3/4» for summary rail */
  short: string
}

export function getVariantMainId(roles: V2VariantRoleAssignment): string | null {
  return (roles.main as string | null | undefined) ?? null
}

/** Non-main role slot holding this media id, if any. */
export function findNonMainRoleSlotForMedia(
  roles: V2VariantRoleAssignment,
  mediaId: string
): V2RoleSlot | null {
  for (const slot of NON_MAIN_ROLE_SLOTS) {
    if (roles[slot] === mediaId) return slot
  }
  return null
}

export function resolveGallerySource(
  roles: V2VariantRoleAssignment,
  mediaId: string
): GallerySourceInfo {
  const mainId = getVariantMainId(roles)
  if (mainId === mediaId) {
    return { kind: "manual", label: "main (invalid in gallery)", short: "—" }
  }
  const slot = findNonMainRoleSlotForMedia(roles, mediaId)
  if (slot) {
    const short = ROLE_SLOT_LABEL_RU[slot]
    return { kind: "role", role: slot, label: `из роли: ${short}`, short }
  }
  return { kind: "manual", label: "ручная витрина", short: "ручн." }
}

export type PoolUsageStatus = {
  isMain: boolean
  isInGallery: boolean
  roleSlot: V2RoleSlot | null
  belongsToActiveVariant: boolean
  /** Single status line for operator scan */
  statusLine: string
}

export function resolvePoolUsageStatus(
  mediaId: string,
  roles: V2VariantRoleAssignment,
  galleryIds: string[],
  belongsToActiveVariant: boolean
): PoolUsageStatus {
  const mainId = getVariantMainId(roles)
  const isMain = mainId === mediaId
  const isInGallery = galleryIds.includes(mediaId)
  const roleSlot = isMain ? ("main" as const) : findNonMainRoleSlotForMedia(roles, mediaId)

  let statusLine = ""
  if (!belongsToActiveVariant) {
    statusLine = "другой цвет"
  } else if (isMain) {
    statusLine = "★ Главное"
  } else if (roleSlot && roleSlot !== "main" && isInGallery) {
    statusLine = `✓ В витрине · ${ROLE_SLOT_LABEL_RU[roleSlot]}`
  } else if (roleSlot && roleSlot !== "main") {
    statusLine = ROLE_SLOT_LABEL_RU[roleSlot]
  } else if (isInGallery) {
    statusLine = "✓ В витрине · ручн."
  }

  return { isMain, isInGallery, roleSlot, belongsToActiveVariant, statusLine }
}
