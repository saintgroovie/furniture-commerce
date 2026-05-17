/**
 * QA-only: unified color chips and per-color issue checklist (no I/O).
 */

import { DEFAULT_VARIANT_KEY } from "./legacy-color-variant-labels"
import { isColorVariantKey, variantChipStatus, type ReadinessKind } from "./legacy-board-operator-polish"
import type { VariantLabelStatus } from "./legacy-color-variant-labels"

export type UnifiedColorChip = {
  variantKey: string
  label: string
  chipStatus: ReturnType<typeof variantChipStatus> | "pending"
  isPendingSuggestion: boolean
  labelEditedByUser: boolean
}

type VariantRow = {
  label: string
  labelStatus?: VariantLabelStatus | string
  labelEditedByUser?: boolean
  primary: string | null
  gallery: string[]
}

type MetaRow = { status?: string; legacyColorName?: string | null }

export function buildUnifiedColorChips(input: {
  variants: Record<string, VariantRow>
  variantMeta?: Record<string, MetaRow>
  safeSuggestions: Array<{ variantKey: string; label: string }>
  resolveLabel: (variantKey: string, variant: VariantRow | null, meta?: MetaRow | null) => string
  activeVariantKey: string
}): UnifiedColorChip[] {
  const keys = new Set<string>()
  for (const vk of Object.keys(input.variants)) {
    if (vk === DEFAULT_VARIANT_KEY && Object.keys(input.variants).some(isColorVariantKey)) continue
    keys.add(vk)
  }
  for (const s of input.safeSuggestions) keys.add(s.variantKey)

  const ordered = Array.from(keys).sort((a, b) => {
    const ac = isColorVariantKey(a) ? 0 : 1
    const bc = isColorVariantKey(b) ? 0 : 1
    if (ac !== bc) return ac - bc
    return a.localeCompare(b)
  })

  return ordered.map((variantKey) => {
    const variant = input.variants[variantKey] ?? null
    const meta = input.variantMeta?.[variantKey]
    const isPendingSuggestion = !variant && input.safeSuggestions.some((s) => s.variantKey === variantKey)
    const label = variant
      ? input.resolveLabel(variantKey, variant, meta)
      : input.safeSuggestions.find((s) => s.variantKey === variantKey)?.label ?? variantKey

    const chipStatus: UnifiedColorChip["chipStatus"] = isPendingSuggestion
      ? "pending"
      : variant
        ? variantChipStatus(
            variantKey,
            {
              ...variant,
              labelStatus: (variant.labelStatus || "") as VariantLabelStatus,
            },
            meta,
            variantKey === input.activeVariantKey
          )
        : "pending"

    return {
      variantKey,
      label,
      chipStatus,
      isPendingSuggestion,
      labelEditedByUser: Boolean(variant?.labelEditedByUser),
    }
  })
}

export type ColorIssueItem = {
  id: string
  label: string
  severity: "warn" | "info"
}

export function buildColorIssueChecklist(input: {
  labelStatus: VariantLabelStatus | string
  primary: string | null
  galleryCount: number
  primaryNeedsReview?: boolean
  primaryAutoPicked?: boolean
  isSuggestionDraft: boolean
  hasPendingSuggestion: boolean
  duplicateHiddenCount?: number
  productReadiness?: ReadinessKind
  missingRoleSlotLabels?: string[]
  hasBorrowedInGallery?: boolean
  hasManualRoleOverride?: boolean
}): ColorIssueItem[] {
  const items: ColorIssueItem[] = []

  if (input.hasPendingSuggestion || input.isSuggestionDraft) {
    items.push({ id: "confirm", label: "Подтвердите цвет или отредактируйте черновик", severity: "warn" })
  }
  if (input.labelStatus === "needs_review" || /уточните/i.test(String(input.labelStatus))) {
    items.push({ id: "label", label: "Уточните название цвета", severity: "warn" })
  }
  if (!input.primary) {
    items.push({ id: "primary", label: "Нет главного фото", severity: "warn" })
  } else if (input.primaryNeedsReview) {
    items.push({ id: "primary-review", label: "Проверьте главное фото", severity: "warn" })
  } else if (input.primaryAutoPicked && !input.primaryNeedsReview) {
    items.push({ id: "primary-auto", label: "Primary выбран автоматически", severity: "info" })
  }
  for (const label of input.missingRoleSlotLabels ?? []) {
    items.push({ id: `slot-missing-${label}`, label: `Нет фото «${label}»`, severity: "warn" })
  }
  if (input.hasBorrowedInGallery) {
    items.push({ id: "borrowed", label: "Есть фото из другого цвета", severity: "info" })
  }
  if (input.hasManualRoleOverride) {
    items.push({ id: "manual-role", label: "Роль фото исправлена вручную", severity: "info" })
  }
  if (input.galleryCount === 0 && input.primary) {
    items.push({ id: "gallery", label: "Галерея пуста — добавьте фото из пула", severity: "info" })
  }
  if ((input.duplicateHiddenCount ?? 0) > 0) {
    items.push({
      id: "dupes",
      label: `Скрыто похожих: ${input.duplicateHiddenCount}`,
      severity: "info",
    })
  }
  if (items.length === 0 && input.productReadiness === "ready") {
    items.push({ id: "ok", label: "Цвет готов к экспорту", severity: "info" })
  } else if (items.length === 0 && input.primary && input.galleryCount > 0) {
    items.push({ id: "ok-media", label: "Главное и галерея назначены", severity: "info" })
  }

  return items
}

export const CHIP_STATUS_LABEL_RU: Record<string, string> = {
  active: "активный",
  confirmed: "подтверждён",
  edited: "изменён",
  needs_review: "проверка",
  draft: "черновик",
  pending: "предложен",
}
