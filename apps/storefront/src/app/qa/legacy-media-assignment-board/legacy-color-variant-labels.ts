/**
 * Russian display labels for legacy media board color variants.
 * Never use «Основной» as a color name — only real color/material labels or review-state placeholders.
 */

export const DEFAULT_VARIANT_KEY = "__default__"

/** @deprecated Use LABEL_NEEDS_REVIEW_RU — kept so old imports fail visibly in tsc. */
export const DEFAULT_VARIANT_LABEL_RU = "Название цвета нужно уточнить"

export const LABEL_NEEDS_REVIEW_RU = "Название цвета нужно уточнить"
export const LABEL_MISSING_RU = "Цвет не указан"

export type VariantLabelStatus = "user_edited" | "legacy" | "inferred" | "needs_review"

const TOKEN_TO_RU: Record<string, string> = {
  blue: "Синий",
  grey: "Серый",
  gray: "Серый",
  white: "Белый",
  cream: "Кремовый",
  milk: "Молочный",
  beige: "Бежевый",
  olive: "Оливковый",
  green: "Зелёный",
  black: "Чёрный",
  brown: "Коричневый",
  graphite: "Графит",
  natural: "Натуральный",
  oak: "Дуб",
  ivory: "Слоновая кость",
  walnut: "Орех",
  wenge: "Венге",
}

const FORBIDDEN_COLOR_LABELS = /^(основной|primary|default|unknown|__default__)$/i

const TECHNICAL_LABEL_RE = /^(default|unknown|color_[a-z0-9_]+|[a-z]+(?:\s+[a-z]+)*)$/i

export function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text)
}

export function isForbiddenColorDisplayLabel(label: string): boolean {
  return FORBIDDEN_COLOR_LABELS.test(label.trim())
}

export function extractColorTokenFromVariantKey(variantKey: string): string | null {
  if (!variantKey || variantKey === DEFAULT_VARIANT_KEY) return null
  const m = variantKey.match(/^color_(.+?)(?:__review)?$/i)
  return m?.[1]?.toLowerCase() ?? null
}

export function sourceLabelFromToken(token: string): string {
  if (!token) return "unset"
  return token
    .split(/[_-]+/)
    .filter(Boolean)
    .map((x) => x[0]?.toUpperCase() + x.slice(1))
    .join(" ")
}

function normalizeTokenParts(token: string): string[] {
  return token
    .toLowerCase()
    .replace(/^color_/, "")
    .split(/[_-]+/)
    .filter((p) => p && p !== "color" && p !== "default")
}

export function inferColorTokenFromSeedUrls(seedUrls: string[]): string | null {
  const hay = seedUrls.join(" ").toLowerCase()
  for (const token of Object.keys(TOKEN_TO_RU)) {
    if (new RegExp(`(?:^|[_\\-.])${token}(?:[_\\-.]|\\.)`, "i").test(hay)) return token
  }
  if (/milk|молоч/i.test(hay)) return "milk"
  if (/cream|крем/i.test(hay)) return "cream"
  if (/beige|беж/i.test(hay)) return "beige"
  return null
}

export function displayLabelFromColorToken(
  token: string,
  opts?: { legacyColorName?: string | null; productSkuHint?: string | null }
): string | null {
  const legacy = opts?.legacyColorName?.trim()
  if (legacy && isUsableLegacyColorName(legacy, opts?.productSkuHint)) return legacy

  const parts = normalizeTokenParts(token)
  if (parts.length === 0) return null

  if (parts.length === 2 && parts[0] === "natural" && parts[1] === "oak") return "Натуральный дуб"

  const mapped = parts.map((p) => TOKEN_TO_RU[p]).filter(Boolean)
  if (mapped.length === parts.length) return mapped.join(" ")

  const single = TOKEN_TO_RU[parts.join("_")] ?? TOKEN_TO_RU[parts[0] ?? ""]
  if (single) return single

  const fallback = parts.map((p) => TOKEN_TO_RU[p] ?? null).filter(Boolean)
  if (fallback.length > 0) return fallback.join(" ")
  return null
}

export function isUsableLegacyColorName(name: string, productSkuHint?: string | null): boolean {
  const n = name.trim()
  if (!n || isForbiddenColorDisplayLabel(n)) return false
  if (productSkuHint && normKey(n) === normKey(productSkuHint)) return false
  if (looksLikeFilenameToken(n)) return false
  if (hasCyrillic(n)) return true
  const lower = n.toLowerCase()
  if (TOKEN_TO_RU[lower]) return false
  return !/^[a-z0-9_-]+$/i.test(n)
}

function normKey(s: string): string {
  return s.replace(/\s+/g, "").replace(/_/g, "-").toLowerCase()
}

function looksLikeFilenameToken(s: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(s) || /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+\./i.test(s)
}

export function isTechnicalDisplayLabel(label: string, variantKey: string): boolean {
  const t = label.trim()
  if (!t || isForbiddenColorDisplayLabel(t)) return true
  const token = extractColorTokenFromVariantKey(variantKey)
  if (!token) return !hasCyrillic(t)
  const lower = t.toLowerCase().replace(/\s+/g, "_")
  if (lower === token || lower === `color_${token}`) return true
  if (TECHNICAL_LABEL_RE.test(t) && !hasCyrillic(t)) {
    const mapped = displayLabelFromColorToken(token)
    return !mapped || mapped.toLowerCase() !== t.toLowerCase()
  }
  return false
}

export function sourceLabelForVariantKey(variantKey: string): string {
  if (variantKey === DEFAULT_VARIANT_KEY) return "default_variant"
  const token = extractColorTokenFromVariantKey(variantKey)
  return token ? sourceLabelFromToken(token) : variantKey
}

export type ResolveVariantLabelInput = {
  variantKey: string
  persistedLabel?: string | null
  sourceLabel?: string | null
  labelEditedByUser?: boolean
  labelStatus?: VariantLabelStatus | null
  legacyColorName?: string | null
  preferLegacyColorName?: boolean
  productSkuHint?: string | null
  seedImageUrls?: string[]
}

export function resolveVariantDisplayLabel(input: ResolveVariantLabelInput): {
  displayLabel: string
  sourceLabel: string
  labelStatus: VariantLabelStatus
} {
  const sourceLabel = (input.sourceLabel?.trim() || sourceLabelForVariantKey(input.variantKey)).trim()
  const persisted = input.persistedLabel?.trim()

  if (input.labelEditedByUser && persisted && !isForbiddenColorDisplayLabel(persisted)) {
    return { displayLabel: persisted, sourceLabel, labelStatus: "user_edited" }
  }

  const legacy = input.legacyColorName?.trim()
  if (legacy && (input.preferLegacyColorName || isUsableLegacyColorName(legacy, input.productSkuHint))) {
    return { displayLabel: legacy, sourceLabel, labelStatus: "legacy" }
  }

  const token =
    extractColorTokenFromVariantKey(input.variantKey) ??
    (input.variantKey === DEFAULT_VARIANT_KEY ? inferColorTokenFromSeedUrls(input.seedImageUrls ?? []) : null)

  if (token) {
    const fromToken = displayLabelFromColorToken(token, {
      legacyColorName: legacy,
      productSkuHint: input.productSkuHint,
    })
    if (fromToken) {
      return { displayLabel: fromToken, sourceLabel: sourceLabelFromToken(token), labelStatus: "inferred" }
    }
  }

  if (persisted && !isTechnicalDisplayLabel(persisted, input.variantKey) && !isForbiddenColorDisplayLabel(persisted)) {
    return {
      displayLabel: persisted,
      sourceLabel,
      labelStatus: input.labelStatus === "needs_review" ? "needs_review" : "inferred",
    }
  }

  return {
    displayLabel: LABEL_NEEDS_REVIEW_RU,
    sourceLabel,
    labelStatus: "needs_review",
  }
}

export type VariantLabelFields = {
  label: string
  sourceLabel?: string | null
  labelEditedByUser?: boolean
  labelStatus?: VariantLabelStatus
}

export function migrateVariantLabelFields(
  variantKey: string,
  variant: VariantLabelFields,
  opts?: {
    legacyColorName?: string | null
    productSkuHint?: string | null
    seedImageUrls?: string[]
  }
): VariantLabelFields {
  if (variant.labelEditedByUser && variant.label && !isForbiddenColorDisplayLabel(variant.label)) {
    return {
      ...variant,
      labelStatus: "user_edited",
      sourceLabel: variant.sourceLabel ?? sourceLabelForVariantKey(variantKey),
    }
  }
  const resolved = resolveVariantDisplayLabel({
    variantKey,
    persistedLabel: variant.label,
    sourceLabel: variant.sourceLabel,
    labelEditedByUser: variant.labelEditedByUser,
    labelStatus: variant.labelStatus,
    legacyColorName: opts?.legacyColorName,
    productSkuHint: opts?.productSkuHint,
    seedImageUrls: opts?.seedImageUrls,
  })
  return {
    ...variant,
    label: resolved.displayLabel,
    sourceLabel: variant.sourceLabel ?? resolved.sourceLabel,
    labelStatus: resolved.labelStatus,
  }
}

export function reviewSuffixRu(label: string): string {
  return `${label} · проверить`
}

export function labelNeedsReviewStyle(labelStatus?: VariantLabelStatus | null): boolean {
  return labelStatus === "needs_review"
}
