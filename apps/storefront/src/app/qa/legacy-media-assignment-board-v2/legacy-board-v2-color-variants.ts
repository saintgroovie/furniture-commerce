/**
 * v2 QA board — operator-managed color variants (detected + added − hidden).
 * Does not touch catalog, DB, or ingestion.
 */

import type { InvItem } from "./legacy-board-v2-types"
import type {
  V2ColorVariant,
  V2OperatorRemovedVariant,
  V2OperatorVariantEdits,
  V2ProductState,
  V2VariantRoleAssignment,
} from "./legacy-board-v2-types"
import {
  extractColorTokenFromMedia,
  neutralExternalOwnerColor,
} from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"

/** Default RU labels for detected tokens (shared with client). */
export const DEFAULT_TOKEN_TO_RU: Record<string, string> = {
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
  ivory: "Слоновая кость",
  walnut: "Орех",
  natural: "Натуральный",
  oak: "Дуб",
  wenge: "Венге",
  molochny: "Молочный",
}

const RU_LABEL_TO_KEY: Record<string, string> = {
  синий: "blue",
  серый: "grey",
  серия: "grey",
  белый: "white",
  кремовый: "cream",
  молочный: "milk",
  бежевый: "beige",
  оливковый: "olive",
  зелёный: "green",
  зеленый: "green",
  чёрный: "black",
  черный: "black",
  коричневый: "brown",
  графит: "graphite",
  "слоновая кость": "ivory",
  орех: "walnut",
  натуральный: "natural",
  дуб: "oak",
  венге: "wenge",
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
}

/** Legacy aggregate tab — no longer shown in v2 color strip (kept for persisted state migration). */
export const LEGACY_ALL_VARIANT_KEY = "__all__"

/** Unresolved color bucket when filename/metadata cannot infer a variant. */
export const NEEDS_COLOR_VARIANT_KEY = "__needs_color__"

/** Unresolved color bucket — not a confirmed variant. */
export const NEEDS_COLOR_VARIANT_LABEL_RU = "Без привязки к цвету"

export const NEEDS_COLOR_VARIANT_TITLE_RU =
  "Общие кадры без цветовой привязки. Назначение в галерею добавит фото в конец галерей всех цветов."

/** Visible helper when colorless tab is active — shown in Media Pool, not only center column. */
export const SHARED_COLORLESS_POOL_HINT_RU =
  "Общие кадры: + Галерея добавит фото в конец галерей всех цветов. Главное назначается только на конкретном цвете."

/** Real color tabs only — excludes pseudo/unresolved buckets. */
export function listRealColorVariantKeys(variants: V2ColorVariant[]): string[] {
  return variants
    .filter((v) => !isPseudoColorVariantKey(v.variantKey))
    .map((v) => v.variantKey)
}

/** True when media id is appended to every real variant gallery. */
export function isMediaInAllRealVariantGalleries(
  galleriesByVariant: Record<string, string[]>,
  mediaId: string,
  realVariantKeys: readonly string[]
): boolean {
  if (realVariantKeys.length === 0) return false
  return realVariantKeys.every((key) => (galleriesByVariant[key] ?? []).includes(mediaId))
}

export const PSEUDO_COLOR_VARIANT_KEYS = new Set([LEGACY_ALL_VARIANT_KEY, NEEDS_COLOR_VARIANT_KEY])

export function isPseudoColorVariantKey(variantKey: string): boolean {
  return PSEUDO_COLOR_VARIANT_KEYS.has(variantKey)
}

/** RU label for gallery/iso neutral shots inferred as cream (v1 sync rules). */
export const INFERRED_NEUTRAL_MILK_LABEL_RU = "Молочный"

/**
 * Deterministic color token: explicit filename token → neutral gallery owner (v1) → unresolved.
 * No pixel / image inference.
 */
export function resolveMediaColorToken(inv: InvItem, productHandle: string): string {
  const explicit = extractColorTokenFromMedia(inv, productHandle)
  if (explicit) return explicit
  const neutralOwner = neutralExternalOwnerColor(inv)
  if (neutralOwner) return neutralOwner
  return "__none__"
}

function labelForDetectedVariant(token: string, hasNeutralGalleryItems: boolean): string {
  if (hasNeutralGalleryItems && (token === "cream" || token === "milk")) {
    return INFERRED_NEUTRAL_MILK_LABEL_RU
  }
  return DEFAULT_TOKEN_TO_RU[token] ?? token
}

/** Milk-like variant — first tab / default when present. */
export function isMilkLikeVariant(variantKey: string, label: string): boolean {
  if (isPseudoColorVariantKey(variantKey)) return false
  const key = variantKey.toLowerCase()
  const hay = `${key} ${label}`.toLowerCase()
  if (["milk", "cream", "ivory", "molochny", "molochnyi", "milky"].includes(key)) return true
  return /молоч|milk|molochn|cream|ivory|сливоч/i.test(hay)
}

export function labelToVariantKey(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return ""
  const lower = trimmed.toLowerCase().replace(/\s+/g, " ")

  if (RU_LABEL_TO_KEY[lower]) return RU_LABEL_TO_KEY[lower]

  if (/молоч/i.test(lower)) return "milk"
  if (/крем/i.test(lower)) return "cream"
  if (/слонов/i.test(lower)) return "ivory"
  if (/сер/i.test(lower) && !/сереб/i.test(lower)) return "grey"
  if (/син/i.test(lower)) return "blue"
  if (/олив/i.test(lower)) return "olive"
  if (/беж/i.test(lower)) return "beige"

  if (/^[a-z][a-z0-9_-]*$/i.test(trimmed)) return trimmed.toLowerCase().replace(/\s+/g, "_")

  let slug = ""
  for (const ch of lower) {
    if (CYRILLIC_TO_LATIN[ch] !== undefined) slug += CYRILLIC_TO_LATIN[ch]
    else if (/[a-z0-9]/.test(ch)) slug += ch
    else if (/\s|-/.test(ch)) slug += "_"
  }
  slug = slug.replace(/_+/g, "_").replace(/^_|_$/g, "")
  return slug || `color_${Math.abs(hashCode(lower))}`
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h
}

export function getHiddenVariantKeys(state: V2ProductState | null | undefined): Set<string> {
  const removed = state?.operatorVariantEdits?.removed ?? []
  return new Set(removed.map((r) => r.key))
}

export function isVariantHidden(state: V2ProductState | null | undefined, key: string): boolean {
  return getHiddenVariantKeys(state).has(key)
}

export function displayLabelForVariant(
  variantKey: string,
  defaultLabel: string,
  state: V2ProductState | null | undefined
): string {
  return state?.variantLabelOverrides?.[variantKey] ?? defaultLabel
}

/** Shared product shots (gallery_*, iso) without explicit color_* token. */
const NEUTRAL_MEDIA_RE =
  /(?:^|[-_])gallery[_\-.]?\d|[-_]iso[-_]?\d|[-_]i3(?:\.|[-_]|$)/i

export function isNeutralSharedMedia(inv: InvItem, productHandle: string): boolean {
  const hay = `${inv.filename} ${inv.source_path ?? ""}`.toLowerCase()
  if (!NEUTRAL_MEDIA_RE.test(hay)) return false
  const token = extractColorTokenFromMedia(inv, productHandle)
  return !token
}

export type MediaVariantScope = "active" | "other_color" | "neutral"

/** Pool / UI scope: active color tab, another color, or neutral shared frame. */
export function classifyMediaVariantScope(
  inv: InvItem,
  productHandle: string,
  activeVariantKey: string
): MediaVariantScope {
  if (activeVariantKey === LEGACY_ALL_VARIANT_KEY) return "active"
  const neutralOwner = neutralExternalOwnerColor(inv)
  if (isNeutralSharedMedia(inv, productHandle)) {
    if (neutralOwner && neutralOwner === activeVariantKey) return "active"
    return "neutral"
  }
  const token = extractColorTokenFromMedia(inv, productHandle)
  if (!token) {
    if (neutralOwner && neutralOwner === activeVariantKey) return "active"
    return "neutral"
  }
  if (token === activeVariantKey) return "active"
  return "other_color"
}

/** Whether inventory media belongs to the active color tab (not another variant). */
export function mediaMatchesVariantKey(
  inv: InvItem,
  productHandle: string,
  variantKey: string
): boolean {
  const scope = classifyMediaVariantScope(inv, productHandle, variantKey)
  return scope === "active" || scope === "neutral"
}

export function buildDetectedColorVariants(
  handle: string,
  candidateIds: string[],
  invById: Map<string, InvItem>
): V2ColorVariant[] {
  const byToken = new Map<string, string[]>()
  /** Tokens that received at least one neutral gallery/iso shot without explicit color_* token. */
  const tokenHasNeutralGallery = new Set<string>()

  for (const id of candidateIds) {
    const inv = invById.get(id)
    if (!inv) continue
    const explicit = extractColorTokenFromMedia(inv, handle)
    let token: string
    if (explicit) {
      token = explicit
    } else {
      const neutralOwner = neutralExternalOwnerColor(inv)
      if (neutralOwner) {
        token = neutralOwner
        tokenHasNeutralGallery.add(neutralOwner)
      } else {
        token = "__none__"
      }
    }
    const list = byToken.get(token) ?? []
    list.push(id)
    byToken.set(token, list)
  }

  const result: V2ColorVariant[] = []
  for (const [token, itemIds] of Array.from(byToken.entries())) {
    if (token === "__none__") continue
    result.push({
      variantKey: token,
      label: labelForDetectedVariant(token, tokenHasNeutralGallery.has(token)),
      itemIds,
      source: "detected",
    })
  }

  const unresolvedIds = byToken.get("__none__") ?? []
  if (unresolvedIds.length > 0) {
    result.push({
      variantKey: NEEDS_COLOR_VARIANT_KEY,
      label: NEEDS_COLOR_VARIANT_LABEL_RU,
      itemIds: unresolvedIds,
      source: "detected",
    })
  }

  return result
}

function mergeAddedVariants(
  detected: V2ColorVariant[],
  state: V2ProductState | null | undefined
): V2ColorVariant[] {
  const hidden = getHiddenVariantKeys(state)
  const byKey = new Map(detected.map((v) => [v.variantKey, v]))

  for (const added of state?.operatorVariantEdits?.added ?? []) {
    if (hidden.has(added.key)) continue
    if (!byKey.has(added.key)) {
      byKey.set(added.key, {
        variantKey: added.key,
        label: added.label,
        itemIds: [],
        source: "operator",
      })
    }
  }

  return Array.from(byKey.values())
}

export function sortColorVariantsWithMilkFirst(variants: V2ColorVariant[]): V2ColorVariant[] {
  const trailing = variants.filter(
    (v) => v.variantKey === LEGACY_ALL_VARIANT_KEY || v.variantKey === NEEDS_COLOR_VARIANT_KEY
  )
  const rest = variants.filter(
    (v) => v.variantKey !== LEGACY_ALL_VARIANT_KEY && v.variantKey !== NEEDS_COLOR_VARIANT_KEY
  )

  rest.sort((a, b) => {
    const aMilk = isMilkLikeVariant(a.variantKey, a.label)
    const bMilk = isMilkLikeVariant(b.variantKey, b.label)
    if (aMilk && !bMilk) return -1
    if (!aMilk && bMilk) return 1
    if (b.itemIds.length !== a.itemIds.length) return b.itemIds.length - a.itemIds.length
    return a.label.localeCompare(b.label, "ru")
  })

  return [...rest, ...trailing]
}

export function filterVisibleColorVariants(
  variants: V2ColorVariant[],
  state: V2ProductState | null | undefined
): V2ColorVariant[] {
  const hidden = getHiddenVariantKeys(state)
  return variants.filter(
    (v) =>
      isPseudoColorVariantKey(v.variantKey) ||
      (v.variantKey !== LEGACY_ALL_VARIANT_KEY && !hidden.has(v.variantKey))
  )
}

export function buildMergedColorVariants(
  handle: string,
  candidateIds: string[],
  invById: Map<string, InvItem>,
  state: V2ProductState | null | undefined
): V2ColorVariant[] {
  const detected = buildDetectedColorVariants(handle, candidateIds, invById)
  const merged = mergeAddedVariants(detected, state)
  const visible = filterVisibleColorVariants(merged, state).filter(
    (v) => v.variantKey !== LEGACY_ALL_VARIANT_KEY
  )
  return sortColorVariantsWithMilkFirst(visible)
}

export function findMilkVariantKey(variants: V2ColorVariant[]): string | null {
  const milk = variants.find(
    (v) => !isPseudoColorVariantKey(v.variantKey) && isMilkLikeVariant(v.variantKey, v.label)
  )
  return milk?.variantKey ?? null
}

/** Default active tab: milk/default first, else first real color, else unresolved pseudo tab. */
export function pickDefaultVariantKey(
  variants: V2ColorVariant[],
  state: V2ProductState | null | undefined
): string {
  if (variants.length === 0) return NEEDS_COLOR_VARIANT_KEY

  const milkKey = findMilkVariantKey(variants)
  if (milkKey) return milkKey

  const explicit = state?.operatorVariantEdits?.default_variant_key
  if (explicit && variants.some((v) => v.variantKey === explicit)) return explicit

  const saved = state?.activeVariantKey
  if (
    saved &&
    saved !== LEGACY_ALL_VARIANT_KEY &&
    variants.some((v) => v.variantKey === saved)
  ) {
    return saved
  }

  const firstColor = variants.find((v) => !isPseudoColorVariantKey(v.variantKey))
  if (firstColor) return firstColor.variantKey

  const unresolved = variants.find((v) => v.variantKey === NEEDS_COLOR_VARIANT_KEY)
  return unresolved?.variantKey ?? variants[0]!.variantKey
}

export function countVariantAssignments(
  variantKey: string,
  state: V2ProductState
): { main: number; gallery: number; roles: number } {
  const roles = state.rolesByVariant[variantKey] ?? {}
  const gallery = state.galleriesByVariant[variantKey] ?? []
  let roleSlots = 0
  for (const [slot, id] of Object.entries(roles)) {
    if (slot !== "main" && id) roleSlots++
  }
  return {
    main: roles.main ? 1 : 0,
    gallery: gallery.length,
    roles: roleSlots,
  }
}

export function resolveVariantLabel(
  variantKey: string,
  variants: V2ColorVariant[],
  state: V2ProductState | null | undefined
): string {
  const found = variants.find((v) => v.variantKey === variantKey)
  const base = found?.label ?? DEFAULT_TOKEN_TO_RU[variantKey] ?? variantKey
  return displayLabelForVariant(variantKey, base, state)
}

/** Keys exported as active variants (not hidden). */
export function getExportableVariantKeys(state: V2ProductState): string[] {
  const hidden = getHiddenVariantKeys(state)
  const keys = new Set([
    ...Object.keys(state.rolesByVariant),
    ...Object.keys(state.galleriesByVariant),
  ])
  return Array.from(keys).filter((k) => !hidden.has(k))
}

export function buildOperatorVariantEditsExport(
  state: V2ProductState
): V2OperatorVariantEdits | undefined {
  const edits = state.operatorVariantEdits
  const added = edits?.added ?? []
  const removed = edits?.removed ?? []
  const activeKeys = getExportableVariantKeys(state)
  const pseudoVariants: V2ColorVariant[] = activeKeys.map((key) => ({
    variantKey: key,
    label: state.variantLabelOverrides?.[key] ?? DEFAULT_TOKEN_TO_RU[key] ?? key,
    itemIds: [],
  }))
  const milkKey = findMilkVariantKey(pseudoVariants)
  if (added.length === 0 && removed.length === 0 && !milkKey) return undefined
  const payload: V2OperatorVariantEdits = { added, removed }
  if (milkKey) payload.default_variant_key = milkKey
  return payload
}

export function ensureEdits(state: V2ProductState): V2OperatorVariantEdits {
  return {
    added: state.operatorVariantEdits?.added ?? [],
    removed: state.operatorVariantEdits?.removed ?? [],
    default_variant_key: state.operatorVariantEdits?.default_variant_key,
  }
}

export function variantExistsInMerged(
  key: string,
  handle: string,
  candidateIds: string[],
  invById: Map<string, InvItem>,
  state: V2ProductState | null
): boolean {
  const merged = buildMergedColorVariants(handle, candidateIds, invById, state)
  return merged.some((v) => v.variantKey === key)
}

export type AddVariantResult =
  | { ok: true; key: string; created: boolean }
  | { ok: false; reason: "empty" | "duplicate"; key: string; label: string }

export function planAddVariant(
  label: string,
  handle: string,
  candidateIds: string[],
  invById: Map<string, InvItem>,
  state: V2ProductState | null
): AddVariantResult {
  const trimmed = label.trim()
  if (!trimmed) return { ok: false, reason: "empty", key: "", label: trimmed }

  const key = labelToVariantKey(trimmed)
  if (!key) return { ok: false, reason: "empty", key: "", label: trimmed }

  const merged = buildMergedColorVariants(handle, candidateIds, invById, state)
  const exists = merged.some((v) => v.variantKey === key)
  if (exists) return { ok: false, reason: "duplicate", key, label: trimmed }

  return { ok: true, key, created: true }
}

export function applyAddVariantToState(
  state: V2ProductState,
  key: string,
  label: string
): V2ProductState {
  const edits = ensureEdits(state)
  const removedIdx = edits.removed.findIndex((r) => r.key === key)
  if (removedIdx >= 0) {
    edits.removed = edits.removed.filter((r) => r.key !== key)
  }
  if (!edits.added.some((a) => a.key === key)) {
    edits.added = [...edits.added, { key, label, source: "operator" }]
  }
  const overrides = { ...(state.variantLabelOverrides ?? {}) }
  overrides[key] = label
  return {
    ...state,
    operatorVariantEdits: edits,
    variantLabelOverrides: overrides,
    activeVariantKey: key,
  }
}

export function applyRemoveVariantToState(
  state: V2ProductState,
  key: string,
  label: string,
  variants: V2ColorVariant[]
): V2ProductState {
  const edits = ensureEdits(state)
  const counts = countVariantAssignments(key, state)

  if (!edits.removed.some((r) => r.key === key)) {
    const entry: V2OperatorRemovedVariant = {
      key,
      label,
      hiddenAt: new Date().toISOString(),
      assignment_counts: counts,
    }
    edits.removed = [...edits.removed, entry]
  }

  // Keep operator-added entries so restore can show the tab again (hide ≠ delete).

  const visible = filterVisibleColorVariants(variants, { ...state, operatorVariantEdits: edits })
  const nextActive = pickDefaultVariantKey(visible, { ...state, operatorVariantEdits: edits })

  return {
    ...state,
    operatorVariantEdits: edits,
    activeVariantKey: nextActive,
  }
}

export function applyRestoreVariantToState(state: V2ProductState, key: string): V2ProductState {
  const edits = ensureEdits(state)
  const removedEntry = edits.removed.find((r) => r.key === key)
  edits.removed = edits.removed.filter((r) => r.key !== key)
  if (removedEntry && !edits.added.some((a) => a.key === key)) {
    edits.added = [
      ...edits.added,
      { key, label: removedEntry.label, source: "operator" as const },
    ]
  }
  return {
    ...state,
    operatorVariantEdits: edits,
    activeVariantKey: key,
  }
}

/** Prefer milk variant for product-list readiness when present. */
export function productReadinessForVariants(
  state: V2ProductState | undefined,
  variantKeys: string[]
): "ready" | "partial" | "empty" {
  if (!state) return "empty"
  const ordered = [...variantKeys].sort((a, b) => {
    const aM = isMilkLikeVariant(a, DEFAULT_TOKEN_TO_RU[a] ?? a)
    const bM = isMilkLikeVariant(b, DEFAULT_TOKEN_TO_RU[b] ?? b)
    if (aM && !bM) return -1
    if (!aM && bM) return 1
    return 0
  })

  for (const key of ordered) {
    const hasMain = !!(state.rolesByVariant[key] as V2VariantRoleAssignment | undefined)?.main
    const galleryCount = state.galleriesByVariant[key]?.length ?? 0
    if (hasMain && galleryCount > 0) return "ready"
  }
  for (const key of ordered) {
    const hasMain = !!(state.rolesByVariant[key] as V2VariantRoleAssignment | undefined)?.main
    const galleryCount = state.galleriesByVariant[key]?.length ?? 0
    if (hasMain || galleryCount > 0) return "partial"
  }
  return "empty"
}
