/**
 * QA-only: operator manual visual-role overrides (localStorage, board UI).
 */

import type { InvItem } from "@/app/qa/legacy-media-assignment-board/legacy-media-board-types"
import {
  classifyVisualRole,
  compareIdsByVisualRole,
  GALLERY_ROLE_ORDER,
  operatorRoleLabelRu,
  type VisualRole,
} from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"

export type OperatorGallerySlotKey =
  | "front_anfas"
  | "front_3_4"
  | "interior"
  | "detail"
  | "lifestyle"
  | "scheme"

export type OperatorMediaRoleChoice =
  | "primary_front"
  | "front_anfas"
  | "front_3_4"
  | "interior"
  | "detail"
  | "lifestyle"
  | "scheme"
  | "exclude"

export type OperatorRoleOverrideRecord = {
  role: OperatorMediaRoleChoice
  excludeFromSuggestions?: boolean
  updatedAt: string
}

export type OperatorRoleOverridesByMediaId = Record<string, OperatorRoleOverrideRecord>

export const OPERATOR_ROLE_OVERRIDES_LS_FIELD = "operatorRoleOverridesByMediaId"

export const GALLERY_ROLE_SLOT_DEFS: ReadonlyArray<{
  slotKey: OperatorGallerySlotKey
  label: string
  placeholderTitle: string
}> = [
  { slotKey: "front_anfas", label: "Анфас", placeholderTitle: "«Анфас»" },
  { slotKey: "front_3_4", label: "3/4", placeholderTitle: "«3/4»" },
  { slotKey: "interior", label: "Внутри", placeholderTitle: "«Внутри»" },
  { slotKey: "detail", label: "Деталь", placeholderTitle: "«Деталь»" },
  { slotKey: "lifestyle", label: "Lifestyle", placeholderTitle: "«Lifestyle»" },
  { slotKey: "scheme", label: "Схема", placeholderTitle: "«Схема»" },
] as const

export const OPERATOR_ROLE_MENU_CHOICES: ReadonlyArray<{
  choice: OperatorMediaRoleChoice
  label: string
}> = [
  { choice: "primary_front", label: "Главное / фронт" },
  { choice: "front_anfas", label: "Анфас" },
  { choice: "front_3_4", label: "3/4" },
  { choice: "interior", label: "Внутри" },
  { choice: "detail", label: "Деталь" },
  { choice: "lifestyle", label: "Lifestyle" },
  { choice: "scheme", label: "Схема" },
  { choice: "exclude", label: "Не использовать в предложениях" },
]

const FRONT_SLOT_ROLES = new Set<VisualRole>(["closed_front", "hero_front", "front_anfas"])

export function operatorChoiceToVisualRole(choice: OperatorMediaRoleChoice): VisualRole | null {
  switch (choice) {
    case "primary_front":
      return "hero_front"
    case "front_anfas":
      return "front_anfas"
    case "front_3_4":
      return "front_3_4"
    case "interior":
      return "interior"
    case "detail":
      return "detail"
    case "lifestyle":
      return "lifestyle"
    case "scheme":
      return "scheme"
    case "exclude":
      return null
    default:
      return null
  }
}

export function visualRoleToGallerySlotKey(role: VisualRole): OperatorGallerySlotKey | null {
  if (FRONT_SLOT_ROLES.has(role)) return "front_anfas"
  if (role === "front_3_4") return "front_3_4"
  if (role === "interior") return "interior"
  if (role === "detail") return "detail"
  if (role === "lifestyle") return "lifestyle"
  if (role === "scheme") return "scheme"
  return null
}

export function parseOperatorRoleOverrides(raw: unknown): OperatorRoleOverridesByMediaId {
  if (!raw || typeof raw !== "object") return {}
  const out: OperatorRoleOverridesByMediaId = {}
  for (const [id, cell] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !cell || typeof cell !== "object") continue
    const row = cell as Record<string, unknown>
    const role = row.role
    if (typeof role !== "string") continue
    if (!OPERATOR_ROLE_MENU_CHOICES.some((c) => c.choice === role)) continue
    out[id] = {
      role: role as OperatorMediaRoleChoice,
      excludeFromSuggestions: Boolean(row.excludeFromSuggestions),
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date(0).toISOString(),
    }
  }
  return out
}

export type EffectiveMediaRole = {
  visualRole: VisualRole
  labelRu: string
  isManual: boolean
  isExcluded: boolean
  menuChoice: OperatorMediaRoleChoice | null
}

export function resolveEffectiveMediaRole(
  mediaId: string,
  inv: InvItem | undefined,
  overrides: OperatorRoleOverridesByMediaId,
  opts?: { productHandle?: string; productSku?: string }
): EffectiveMediaRole {
  const manual = overrides[mediaId]
  if (manual?.role === "exclude") {
    return {
      visualRole: "unknown",
      labelRu: "не использовать",
      isManual: true,
      isExcluded: true,
      menuChoice: "exclude",
    }
  }
  if (manual?.role) {
    const mapped = operatorChoiceToVisualRole(manual.role)
    if (mapped) {
      return {
        visualRole: mapped,
        labelRu: OPERATOR_ROLE_MENU_CHOICES.find((c) => c.choice === manual.role)?.label ?? operatorRoleLabelRu(mapped),
        isManual: true,
        isExcluded: false,
        menuChoice: manual.role,
      }
    }
  }
  const auto = inv
    ? classifyVisualRole(inv, { productHandle: opts?.productHandle, productSku: opts?.productSku })
    : "unknown"
  return {
    visualRole: auto,
    labelRu: operatorRoleLabelRu(auto),
    isManual: false,
    isExcluded: false,
    menuChoice: null,
  }
}

export function buildOperatorAwareRolesById(
  mediaIds: string[],
  invById: Map<string, InvItem>,
  overrides: OperatorRoleOverridesByMediaId,
  opts?: { productHandle?: string; productSku?: string }
): Map<string, VisualRole> {
  const rolesById = new Map<string, VisualRole>()
  for (const id of mediaIds) {
    const inv = invById.get(id)
    const eff = resolveEffectiveMediaRole(id, inv, overrides, opts)
    rolesById.set(id, eff.isExcluded ? "unknown" : eff.visualRole)
  }
  return rolesById
}

export type GalleryRoleSlotCell = {
  slotKey: OperatorGallerySlotKey
  label: string
  placeholderTitle: string
  mediaIds: string[]
  isEmpty: boolean
}

export type GalleryRoleSlotAssignment = {
  slots: GalleryRoleSlotCell[]
  overflowMediaIds: string[]
  rolesById: Map<string, VisualRole>
  hasManualOverride: boolean
  hasBorrowedInGallery: boolean
  missingSlotLabels: string[]
}

export function buildGalleryRoleSlotAssignment(input: {
  primaryId: string | null
  galleryIds: string[]
  invById: Map<string, InvItem>
  overrides: OperatorRoleOverridesByMediaId
  borrowedMeta?: Record<string, { fromVariantKey: string; fromVariantLabel: string }>
  productHandle?: string
  productSku?: string
}): GalleryRoleSlotAssignment {
  const galleryOnly = input.galleryIds.filter((id) => id && id !== input.primaryId)
  const rolesById = buildOperatorAwareRolesById(
    [...(input.primaryId ? [input.primaryId] : []), ...galleryOnly],
    input.invById,
    input.overrides,
    { productHandle: input.productHandle, productSku: input.productSku }
  )

  const slotBuckets = new Map<OperatorGallerySlotKey, string[]>()
  for (const def of GALLERY_ROLE_SLOT_DEFS) slotBuckets.set(def.slotKey, [])

  const overflow: string[] = []
  let hasManualOverride = false
  let hasBorrowedInGallery = false

  for (const id of galleryOnly) {
    const inv = input.invById.get(id)
    const eff = resolveEffectiveMediaRole(id, inv, input.overrides, {
      productHandle: input.productHandle,
      productSku: input.productSku,
    })
    if (eff.isManual) hasManualOverride = true
    if (input.borrowedMeta?.[id]) hasBorrowedInGallery = true
    const slot = visualRoleToGallerySlotKey(eff.visualRole)
    if (!slot) {
      overflow.push(id)
      continue
    }
    slotBuckets.get(slot)!.push(id)
  }

  const slots: GalleryRoleSlotCell[] = GALLERY_ROLE_SLOT_DEFS.map((def) => {
    const mediaIds = slotBuckets.get(def.slotKey) ?? []
    return {
      slotKey: def.slotKey,
      label: def.label,
      placeholderTitle: def.placeholderTitle,
      mediaIds,
      isEmpty: mediaIds.length === 0,
    }
  })

  const missingSlotLabels = slots.filter((s) => s.isEmpty).map((s) => s.label)

  return {
    slots,
    overflowMediaIds: overflow,
    rolesById,
    hasManualOverride,
    hasBorrowedInGallery,
    missingSlotLabels,
  }
}

export function sortGalleryByEffectiveRoles(
  galleryIds: string[],
  primaryId: string | null,
  invById: Map<string, InvItem>,
  overrides: OperatorRoleOverridesByMediaId,
  opts?: { productHandle?: string; productSku?: string }
): string[] {
  const rolesById = buildOperatorAwareRolesById(galleryIds, invById, overrides, opts)
  const rank = (id: string) => {
    const role = rolesById.get(id) ?? "unknown"
    const slot = visualRoleToGallerySlotKey(role)
    if (!slot) return 999
    const idx = GALLERY_ROLE_ORDER.indexOf(role)
    return idx >= 0 ? idx : 998
  }
  return [...galleryIds.filter((id) => id !== primaryId)].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return compareIdsByVisualRole(a, b, invById as Map<string, InvItem>, { rolesById })
  })
}

export function roleSlotEmptyPlaceholder(placeholderTitle: string): string {
  return `Нет фото ${placeholderTitle}. Добавьте из media pool или используйте фото этого SKU из другого цвета.`
}
