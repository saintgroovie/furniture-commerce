/**
 * Role → gallery sync for v2 board.
 *
 * Rule (QA-only, no export contract change):
 * - Non-main role slots drive gallery membership and default order.
 * - Order follows GALLERY_SYNC_ROLE_ORDER (Анфас → … → Схема).
 * - New assignment: insert at role-order index; if already in gallery, move there.
 * - Main never adds to gallery; assigning main removes that mediaId from gallery.
 * - Clear role: remove from gallery only if mediaId is not in another non-main slot.
 * - Manual reorder / insert keeps extra ids; role sync only repositions role-assigned ids.
 */

import type { V2RoleSlot, V2VariantRoleAssignment } from "./legacy-board-v2-types"

/** Non-main slots that map to variants.<color>.gallery[] */
export const GALLERY_SYNC_ROLE_ORDER: readonly V2RoleSlot[] = [
  "front_anfas",
  "front_3_4",
  "interior",
  "detail",
  "lifestyle",
  "scheme",
] as const

function roleOrderIndex(slot: V2RoleSlot): number {
  const i = GALLERY_SYNC_ROLE_ORDER.indexOf(slot)
  return i === -1 ? 999 : i
}

export function findNonMainSlotForMedia(
  roles: V2VariantRoleAssignment,
  mediaId: string
): V2RoleSlot | null {
  for (const slot of GALLERY_SYNC_ROLE_ORDER) {
    if (roles[slot] === mediaId) return slot
  }
  return null
}

export function mediaInOtherNonMainRole(
  roles: V2VariantRoleAssignment,
  mediaId: string,
  exceptSlot?: V2RoleSlot
): boolean {
  for (const slot of GALLERY_SYNC_ROLE_ORDER) {
    if (exceptSlot === slot) continue
    if (roles[slot] === mediaId) return true
  }
  return false
}

function computeInsertIndex(
  gallery: string[],
  slot: V2RoleSlot,
  roles: V2VariantRoleAssignment
): number {
  const newIdx = roleOrderIndex(slot)
  for (let i = 0; i < gallery.length; i++) {
    const id = gallery[i]
    const itemSlot = findNonMainSlotForMedia(roles, id)
    if (itemSlot && roleOrderIndex(itemSlot) > newIdx) return i
  }
  return gallery.length
}

/** Insert or move mediaId to role-order position in gallery (no duplicates). */
export function upsertGalleryByRole(
  gallery: string[],
  mediaId: string,
  slot: V2RoleSlot,
  roles: V2VariantRoleAssignment
): string[] {
  const without = gallery.filter((id) => id !== mediaId)
  const at = computeInsertIndex(without, slot, roles)
  const next = [...without]
  next.splice(at, 0, mediaId)
  return next
}

/** Remove mediaId from gallery when it no longer sits in any non-main role slot. */
export function removeGalleryIfOrphan(
  gallery: string[],
  mediaId: string,
  roles: V2VariantRoleAssignment
): string[] {
  if (mediaInOtherNonMainRole(roles, mediaId)) return gallery
  return gallery.filter((id) => id !== mediaId)
}

/** Main assignment must not appear in gallery export list. */
export function stripFromGallery(gallery: string[], mediaId: string): string[] {
  return gallery.filter((id) => id !== mediaId)
}
