/**
 * Centralized per-variant state mutations + invariants for v2 board.
 *
 * Gallery sync rule:
 * - Main never in gallery.
 * - Non-main role assignment auto-adds to gallery (append if missing; keep position if present).
 * - Clear role removes from gallery when id is not in another non-main slot.
 * - Manual reorder / insert preserved until next normalize heals main/duplicates.
 */

import type { V2ProductState, V2RoleSlot, V2VariantRoleAssignment } from "./legacy-board-v2-types"
import { reorderGalleryIds } from "./legacy-board-v2-gallery-order"

export const NON_MAIN_ROLE_SLOTS: readonly V2RoleSlot[] = [
  "front_anfas",
  "front_3_4",
  "interior",
  "detail",
  "lifestyle",
  "scheme",
] as const

const ALL_ROLE_SLOTS: readonly V2RoleSlot[] = ["main", ...NON_MAIN_ROLE_SLOTS] as const

export function getVariantRoles(
  state: V2ProductState,
  variantKey: string
): V2VariantRoleAssignment {
  return { ...(state.rolesByVariant[variantKey] ?? {}) }
}

export function getVariantGallery(state: V2ProductState, variantKey: string): string[] {
  return [...(state.galleriesByVariant[variantKey] ?? [])]
}

function dedupeGalleryPreserveOrder(gallery: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of gallery) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Enforce: single main; main ∉ gallery; main ∉ non-main slots;
 * unique gallery; each non-main role id present in gallery (appended if missing).
 */
export function normalizeVariantState(
  roles: V2VariantRoleAssignment,
  gallery: string[]
): { roles: V2VariantRoleAssignment; gallery: string[] } {
  const nextRoles: V2VariantRoleAssignment = { ...roles }
  const mainId = (nextRoles.main as string | null | undefined) ?? null

  if (mainId) {
    for (const slot of NON_MAIN_ROLE_SLOTS) {
      if (nextRoles[slot] === mainId) nextRoles[slot] = null
    }
  }

  const seenInSlots = new Set<string>()
  for (const slot of ALL_ROLE_SLOTS) {
    const id = (nextRoles[slot] as string | null | undefined) ?? null
    if (!id) continue
    if (seenInSlots.has(id)) {
      nextRoles[slot] = null
      continue
    }
    seenInSlots.add(id)
  }

  let nextGallery = dedupeGalleryPreserveOrder(gallery)
  if (mainId) {
    nextGallery = nextGallery.filter((id) => id !== mainId)
  }

  for (const slot of NON_MAIN_ROLE_SLOTS) {
    const id = (nextRoles[slot] as string | null | undefined) ?? null
    if (!id || id === mainId) continue
    if (!nextGallery.includes(id)) nextGallery = [...nextGallery, id]
  }

  return { roles: nextRoles, gallery: nextGallery }
}

function patchVariant(
  state: V2ProductState,
  variantKey: string,
  roles: V2VariantRoleAssignment,
  gallery: string[],
  roleOverrides?: Record<string, V2RoleSlot>
): V2ProductState {
  const normalized = normalizeVariantState(roles, gallery)
  const next: V2ProductState = {
    ...state,
    rolesByVariant: { ...state.rolesByVariant, [variantKey]: normalized.roles },
    galleriesByVariant: { ...state.galleriesByVariant, [variantKey]: normalized.gallery },
  }
  if (roleOverrides !== undefined) {
    next.roleOverrides = roleOverrides
  }
  return next
}

export function healVariantState(state: V2ProductState, variantKey: string): V2ProductState {
  return patchVariant(
    state,
    variantKey,
    getVariantRoles(state, variantKey),
    getVariantGallery(state, variantKey)
  )
}

export function assignMain(
  state: V2ProductState,
  variantKey: string,
  mediaId: string
): V2ProductState {
  const roles = getVariantRoles(state, variantKey)
  const gallery = getVariantGallery(state, variantKey)

  for (const slot of ALL_ROLE_SLOTS) {
    if (roles[slot] === mediaId && slot !== "main") roles[slot] = null
  }
  roles.main = mediaId

  const overrides = { ...(state.roleOverrides ?? {}) }
  delete overrides[mediaId]

  const galleryWithout = gallery.filter((id) => id !== mediaId)
  return patchVariant(state, variantKey, roles, galleryWithout, overrides)
}

export function clearMain(state: V2ProductState, variantKey: string): V2ProductState {
  const roles = getVariantRoles(state, variantKey)
  roles.main = null
  return patchVariant(state, variantKey, roles, getVariantGallery(state, variantKey))
}

export function assignRole(
  state: V2ProductState,
  variantKey: string,
  slot: V2RoleSlot,
  mediaId: string
): V2ProductState {
  if (slot === "main") return assignMain(state, variantKey, mediaId)

  const roles = getVariantRoles(state, variantKey)
  let gallery = getVariantGallery(state, variantKey)
  const overrides = { ...(state.roleOverrides ?? {}) }

  if (roles.main === mediaId) roles.main = null

  for (const key of ALL_ROLE_SLOTS) {
    if (key !== slot && roles[key] === mediaId) roles[key] = null
  }
  roles[slot] = mediaId
  overrides[mediaId] = slot

  if (!gallery.includes(mediaId)) {
    gallery = [...gallery, mediaId]
  }

  return patchVariant(state, variantKey, roles, gallery, overrides)
}

export function clearRole(
  state: V2ProductState,
  variantKey: string,
  slot: V2RoleSlot
): V2ProductState {
  if (slot === "main") return clearMain(state, variantKey)

  const roles = getVariantRoles(state, variantKey)
  const clearedId = (roles[slot] as string | null | undefined) ?? null
  roles[slot] = null

  const overrides = { ...(state.roleOverrides ?? {}) }
  if (clearedId) delete overrides[clearedId]

  let gallery = getVariantGallery(state, variantKey)
  if (clearedId) {
    const stillInRole = NON_MAIN_ROLE_SLOTS.some((s) => roles[s] === clearedId)
    if (!stillInRole) gallery = gallery.filter((id) => id !== clearedId)
  }

  return patchVariant(state, variantKey, roles, gallery, overrides)
}

export function addToGallery(
  state: V2ProductState,
  variantKey: string,
  mediaId: string
): V2ProductState {
  const roles = getVariantRoles(state, variantKey)
  const mainId = (roles.main as string | null | undefined) ?? null
  if (mainId === mediaId) return state

  const gallery = getVariantGallery(state, variantKey)
  if (gallery.includes(mediaId)) return patchVariant(state, variantKey, roles, gallery)
  return patchVariant(state, variantKey, roles, [...gallery, mediaId])
}

/** Append media to gallery[] of each real color variant (skip duplicates per variant). */
export function addToGalleryAllRealVariants(
  state: V2ProductState,
  variantKeys: readonly string[],
  mediaId: string
): V2ProductState {
  let next = state
  for (const key of variantKeys) {
    next = addToGallery(next, key, mediaId)
  }
  return next
}

/** Assign non-main role on every real color variant (gallery sync per variant). */
export function assignRoleAllRealVariants(
  state: V2ProductState,
  variantKeys: readonly string[],
  slot: V2RoleSlot,
  mediaId: string
): V2ProductState {
  if (slot === "main") return state
  let next = state
  for (const key of variantKeys) {
    next = assignRole(next, key, slot, mediaId)
  }
  return next
}

export function removeFromGallery(
  state: V2ProductState,
  variantKey: string,
  mediaId: string
): V2ProductState {
  const roles = getVariantRoles(state, variantKey)
  const gallery = getVariantGallery(state, variantKey).filter((id) => id !== mediaId)
  return patchVariant(state, variantKey, roles, gallery)
}

export function reorderGallery(
  state: V2ProductState,
  variantKey: string,
  fromIdx: number,
  toIdx: number
): V2ProductState {
  const roles = getVariantRoles(state, variantKey)
  const gallery = getVariantGallery(state, variantKey)
  const reordered = reorderGalleryIds(gallery, fromIdx, toIdx)
  if (!reordered) return state
  return patchVariant(state, variantKey, roles, reordered)
}

export function insertIntoGallery(
  state: V2ProductState,
  variantKey: string,
  mediaId: string,
  atIdx: number
): V2ProductState {
  const roles = getVariantRoles(state, variantKey)
  const mainId = (roles.main as string | null | undefined) ?? null
  if (mainId === mediaId) return state

  const gallery = [...getVariantGallery(state, variantKey)]
  const existingIdx = gallery.indexOf(mediaId)
  if (existingIdx !== -1) gallery.splice(existingIdx, 1)
  const idx = Math.max(0, Math.min(atIdx, gallery.length))
  gallery.splice(idx, 0, mediaId)
  return patchVariant(state, variantKey, roles, gallery)
}

export type V2InvariantViolation = string

/** QA/dev: returns human-readable violations (empty = ok). */
export function assertV2VariantInvariants(
  state: V2ProductState,
  variantKey: string
): V2InvariantViolation[] {
  const errors: V2InvariantViolation[] = []
  const roles = state.rolesByVariant[variantKey] ?? {}
  const gallery = state.galleriesByVariant[variantKey] ?? []
  const mainId = (roles.main as string | null | undefined) ?? null

  if (mainId && gallery.includes(mainId)) {
    errors.push(`main ${mainId} must not appear in gallery`)
  }

  const slotByMedia = new Map<string, V2RoleSlot>()
  for (const slot of ALL_ROLE_SLOTS) {
    const id = (roles[slot] as string | null | undefined) ?? null
    if (!id) continue
    if (slot !== "main" && mainId && id === mainId) {
      errors.push(`main ${mainId} must not occupy non-main slot ${slot}`)
    }
    const prev = slotByMedia.get(id)
    if (prev && prev !== slot) {
      errors.push(`media ${id} assigned to both ${prev} and ${slot}`)
    }
    slotByMedia.set(id, slot)
  }

  const seenGallery = new Set<string>()
  for (const id of gallery) {
    if (seenGallery.has(id)) errors.push(`duplicate gallery id ${id}`)
    seenGallery.add(id)
    if (mainId && id === mainId) errors.push(`gallery contains main ${mainId}`)
  }

  for (const slot of NON_MAIN_ROLE_SLOTS) {
    const id = (roles[slot] as string | null | undefined) ?? null
    if (!id || id === mainId) continue
    if (!gallery.includes(id)) {
      errors.push(`role ${slot} media ${id} missing from gallery`)
    }
  }

  return errors
}
