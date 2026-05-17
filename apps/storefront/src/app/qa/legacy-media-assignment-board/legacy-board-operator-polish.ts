/**
 * QA-only: operator-facing labels and SKU review progress (no I/O).
 */

import { DEFAULT_VARIANT_KEY, type VariantLabelStatus } from "./legacy-color-variant-labels"
import { isBulkGalleryVariantKey } from "./legacy-board-variant-gallery-append"

export type ReadinessKind = "ready" | "needs_review" | "no_primary" | "label_review"

export type SkuReviewProgress = {
  totalColors: number
  confirmedColors: number
  needsReviewColors: number
  primaryMissing: number
  galleryEmpty: number
  hiddenDuplicates: number
  readiness: ReadinessKind
  readinessLabel: string
}

type VariantRow = {
  label: string
  labelStatus?: string
  labelEditedByUser?: boolean
  primary: string | null
  gallery: string[]
}

type MetaRow = { status?: string; legacyColorName?: string | null }

export function isColorVariantKey(variantKey: string): boolean {
  return isBulkGalleryVariantKey(variantKey)
}

export function computeSkuReviewProgress(input: {
  variants: Record<string, VariantRow>
  variantMeta?: Record<string, MetaRow>
  pendingSuggestions: Array<{ variantKey: string; duplicateHiddenCount?: number }>
}): SkuReviewProgress {
  const colorKeys = Object.keys(input.variants).filter(isColorVariantKey)
  let confirmedColors = 0
  let needsReviewColors = 0
  let primaryMissing = 0
  let galleryEmpty = 0

  for (const vk of colorKeys) {
    const v = input.variants[vk]!
    const meta = input.variantMeta?.[vk]
    const labelStatus = (v.labelStatus || "") as VariantLabelStatus
    const needsLabel =
      labelStatus === "needs_review" ||
      /уточните|needs review/i.test(v.label) ||
      meta?.status === "needs_review"

    if (needsLabel) needsReviewColors += 1
    else confirmedColors += 1

    if (!v.primary) primaryMissing += 1
    if (v.gallery.length === 0) galleryEmpty += 1
  }

  const hiddenDuplicates = input.pendingSuggestions.reduce((n, s) => n + (s.duplicateHiddenCount || 0), 0)
  const pendingCount = input.pendingSuggestions.length
  const totalColors = Math.max(colorKeys.length, confirmedColors + pendingCount)

  let readiness: ReadinessKind = "ready"
  let readinessLabel = "Готово к экспорту"

  if (pendingCount > 0 || needsReviewColors > 0) {
    readiness = "needs_review"
    readinessLabel = "Товар требует проверки"
  } else if (primaryMissing > 0) {
    readiness = "no_primary"
    readinessLabel = "Нет главного фото"
  } else if (
    colorKeys.some((vk) => {
      const v = input.variants[vk]!
      const ls = (v.labelStatus || "") as VariantLabelStatus
      return ls === "needs_review"
    })
  ) {
    readiness = "label_review"
    readinessLabel = "Нет названия цвета"
  }

  if (colorKeys.length === 0 && pendingCount === 0) {
    const def = input.variants[DEFAULT_VARIANT_KEY]
    if (def && !def.primary) {
      readiness = "no_primary"
      readinessLabel = "Нет главного фото"
    }
  }

  return {
    totalColors,
    confirmedColors,
    needsReviewColors,
    primaryMissing,
    galleryEmpty,
    hiddenDuplicates,
    readiness,
    readinessLabel,
  }
}

export function variantChipStatus(
  variantKey: string,
  variant: VariantRow,
  meta: MetaRow | undefined,
  isActive: boolean
): "active" | "confirmed" | "edited" | "needs_review" | "draft" {
  if (isActive) return "active"
  if (meta?.status === "suggested") return "draft"
  const labelStatus = (variant.labelStatus || "") as VariantLabelStatus
  if (labelStatus === "needs_review") return "needs_review"
  if (variant.labelEditedByUser || meta?.status === "edited") return "edited"
  return "confirmed"
}

/** Export + products[] mirror: active color chip wins; ignore empty __default__ when colors exist. */
export function resolveActiveVariantKeyForExport(
  handle: string,
  variants: Record<string, VariantRow> | undefined,
  activeVariantByHandle: Record<string, string>
): string {
  const h = handle.toLowerCase()
  const row = variants ?? {}
  const colorKeys = Object.keys(row).filter(isColorVariantKey).sort()
  const firstColorWithMedia = () =>
    colorKeys.find((k) => Boolean(row[k]?.primary) || (row[k]?.gallery?.length ?? 0) > 0) ?? colorKeys[0]

  const explicit = activeVariantByHandle[h]
  if (explicit && row[explicit]) {
    if (isColorVariantKey(explicit)) return explicit
    if (explicit === DEFAULT_VARIANT_KEY && colorKeys.length > 0) {
      return firstColorWithMedia() ?? explicit
    }
    return explicit
  }
  if (colorKeys.length) return firstColorWithMedia() ?? colorKeys[0]!
  if (row[DEFAULT_VARIANT_KEY]) return DEFAULT_VARIANT_KEY
  return Object.keys(row)[0] ?? DEFAULT_VARIANT_KEY
}

export const OPERATOR_LABELS = {
  primary: "Главное",
  gallery: "В галерею",
  allColors: "Во все цвета",
  rename: "Переименовать",
  confirmColor: "Подтвердить цвет",
  confirmAll: "Подтвердить всё",
  details: "Подробнее",
  more: "Ещё",
  returnToPool: "Вернуть",
  removeFromGallery: "Удалить из галереи",
  refineLabel: "Уточнить название",
  checkPrimary: "Проверить главное фото",
  nextProduct: "Следующий товар",
  skipProduct: "Пропустить и перейти дальше",
  skipProductHelper: "Можно пропустить и вернуться позже",
  hiddenSimilar: (n: number) => `+${n} похожих скрыто`,
} as const
