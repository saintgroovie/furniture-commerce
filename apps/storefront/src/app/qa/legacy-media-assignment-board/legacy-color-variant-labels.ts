/**
 * Russian display labels for legacy media board color variants.
 * Priority: user-edited label → legacy Russian color name → token map → never SKU/filename.
 */

export const DEFAULT_VARIANT_KEY = "__default__"
export const DEFAULT_VARIANT_LABEL_RU = "Основной"

const TOKEN_TO_RU: Record<string, string> = {
  blue: "Синий",
  grey: "Серый",
  gray: "Серый",
  white: "Белый",
  cream: "Кремовый",
  beige: "Бежевый",
  olive: "Оливковый",
  green: "Зелёный",
  black: "Чёрный",
  brown: "Коричневый",
  graphite: "Графит",
  natural: "Натуральный",
  oak: "Дуб",
  default: DEFAULT_VARIANT_LABEL_RU,
}

const TECHNICAL_LABEL_RE = /^(default|unknown|color_[a-z0-9_]+|[a-z]+(?:\s+[a-z]+)*)$/i

export function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text)
}

export function extractColorTokenFromVariantKey(variantKey: string): string | null {
  if (!variantKey || variantKey === DEFAULT_VARIANT_KEY) return null
  const m = variantKey.match(/^color_(.+?)(?:__review)?$/i)
  return m?.[1]?.toLowerCase() ?? null
}

export function sourceLabelFromToken(token: string): string {
  if (!token) return "default"
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
    .filter((p) => p && p !== "color")
}

export function displayLabelFromColorToken(
  token: string,
  opts?: { legacyColorName?: string | null; productSkuHint?: string | null }
): string {
  const legacy = opts?.legacyColorName?.trim()
  if (legacy && isUsableLegacyColorName(legacy, opts?.productSkuHint)) return legacy

  const parts = normalizeTokenParts(token)
  if (parts.length === 0) return DEFAULT_VARIANT_LABEL_RU

  if (parts.length === 2 && parts[0] === "natural" && parts[1] === "oak") return "Натуральный дуб"

  const mapped = parts.map((p) => TOKEN_TO_RU[p]).filter(Boolean)
  if (mapped.length === parts.length) return mapped.join(" ")

  const single = TOKEN_TO_RU[parts.join("_")] ?? TOKEN_TO_RU[parts[0] ?? ""]
  if (single) return single

  return parts.map((p) => TOKEN_TO_RU[p] ?? p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
}

export function isUsableLegacyColorName(name: string, productSkuHint?: string | null): boolean {
  const n = name.trim()
  if (!n) return false
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
  if (!t) return true
  if (variantKey === DEFAULT_VARIANT_KEY) {
    return /^(default|основной)$/i.test(t) === false && /^[a-z0-9_\s-]+$/i.test(t) && !hasCyrillic(t)
  }
  const token = extractColorTokenFromVariantKey(variantKey)
  if (!token) return /^[a-z0-9_\s-]+$/i.test(t) && !hasCyrillic(t)
  const lower = t.toLowerCase().replace(/\s+/g, "_")
  if (lower === token || lower === `color_${token}`) return true
  if (TECHNICAL_LABEL_RE.test(t) && !hasCyrillic(t)) {
    const mapped = displayLabelFromColorToken(token)
    return mapped.toLowerCase() !== t.toLowerCase() && sourceLabelFromToken(token).toLowerCase() === t.toLowerCase()
  }
  return false
}

export function sourceLabelForVariantKey(variantKey: string): string {
  if (variantKey === DEFAULT_VARIANT_KEY) return "default"
  const token = extractColorTokenFromVariantKey(variantKey)
  return token ? sourceLabelFromToken(token) : variantKey
}

export type ResolveVariantLabelInput = {
  variantKey: string
  persistedLabel?: string | null
  sourceLabel?: string | null
  labelEditedByUser?: boolean
  legacyColorName?: string | null
  /** When true, legacy name wins even if Latin (e.g. user clicked “use indexed name”). */
  preferLegacyColorName?: boolean
  productSkuHint?: string | null
}

export function resolveVariantDisplayLabel(input: ResolveVariantLabelInput): {
  displayLabel: string
  sourceLabel: string
} {
  const sourceLabel = (input.sourceLabel?.trim() || sourceLabelForVariantKey(input.variantKey)).trim()
  const persisted = input.persistedLabel?.trim()

  if (input.labelEditedByUser && persisted) {
    return { displayLabel: persisted, sourceLabel }
  }

  const legacy = input.legacyColorName?.trim()
  if (legacy && (input.preferLegacyColorName || isUsableLegacyColorName(legacy, input.productSkuHint))) {
    return { displayLabel: legacy, sourceLabel }
  }

  const token = extractColorTokenFromVariantKey(input.variantKey)
  if (token) {
    return {
      displayLabel: displayLabelFromColorToken(token, {
        legacyColorName: legacy,
        productSkuHint: input.productSkuHint,
      }),
      sourceLabel,
    }
  }

  if (input.variantKey === DEFAULT_VARIANT_KEY) {
    return { displayLabel: DEFAULT_VARIANT_LABEL_RU, sourceLabel: "default" }
  }

  if (persisted && !isTechnicalDisplayLabel(persisted, input.variantKey)) {
    return { displayLabel: persisted, sourceLabel }
  }

  return {
    displayLabel: displayLabelFromColorToken(input.variantKey, { productSkuHint: input.productSkuHint }),
    sourceLabel,
  }
}

export type VariantLabelFields = {
  label: string
  sourceLabel?: string | null
  labelEditedByUser?: boolean
}

export function migrateVariantLabelFields(
  variantKey: string,
  variant: VariantLabelFields,
  opts?: { legacyColorName?: string | null; productSkuHint?: string | null }
): VariantLabelFields {
  const resolved = resolveVariantDisplayLabel({
    variantKey,
    persistedLabel: variant.label,
    sourceLabel: variant.sourceLabel,
    labelEditedByUser: variant.labelEditedByUser,
    legacyColorName: opts?.legacyColorName,
    productSkuHint: opts?.productSkuHint,
  })
  if (variant.labelEditedByUser) {
    return {
      ...variant,
      sourceLabel: variant.sourceLabel ?? resolved.sourceLabel,
    }
  }
  return {
    ...variant,
    label: resolved.displayLabel,
    sourceLabel: variant.sourceLabel ?? resolved.sourceLabel,
  }
}

export function reviewSuffixRu(label: string): string {
  return `${label} · проверить`
}
