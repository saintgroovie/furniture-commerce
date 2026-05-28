/**
 * Durable operator color labels — stable keys, custom: prefix, merge priority.
 * QA-only; no catalog / DB writes.
 */

import type {
  V2ColorVariant,
  V2OperatorAddedVariant,
  V2OperatorVariantEdits,
  V2ProductState,
  V2VariantColorMeta,
  InvItem,
} from "./legacy-board-v2-types"

export const CUSTOM_VARIANT_KEY_PREFIX = "custom:"

export type { V2VariantColorMeta }

/** Slug for custom keys — no RU→token alias (avoids «Мятный» → milk). */
export function slugForCustomColorKey(label: string): string {
  const trimmed = label.trim().toLowerCase().replace(/\s+/g, " ")
  if (!trimmed) return ""

  if (/^[a-z][a-z0-9_-]*$/i.test(label.trim())) {
    return label.trim().toLowerCase().replace(/\s+/g, "_")
  }

  const CYRILLIC_TO_LATIN: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }

  let slug = ""
  for (const ch of trimmed) {
    if (CYRILLIC_TO_LATIN[ch] !== undefined) slug += CYRILLIC_TO_LATIN[ch]
    else if (/[a-z0-9]/.test(ch)) slug += ch
    else if (/\s|-/.test(ch)) slug += "_"
  }
  return slug.replace(/_+/g, "_").replace(/^_|_$/g, "")
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return Math.abs(h)
}

export function isOperatorCustomVariantKey(variantKey: string): boolean {
  return variantKey.startsWith(CUSTOM_VARIANT_KEY_PREFIX)
}

export function allocateCustomVariantKey(label: string, taken: Set<string>): string {
  const slug = slugForCustomColorKey(label) || `c${hashCode(label.trim())}`
  let key = `${CUSTOM_VARIANT_KEY_PREFIX}${slug}`
  let n = 2
  while (taken.has(key)) {
    key = `${CUSTOM_VARIANT_KEY_PREFIX}${slug}_${n}`
    n += 1
  }
  return key
}

export function collectTakenVariantKeys(
  handle: string,
  candidateIds: string[],
  invById: Map<string, InvItem>,
  state: V2ProductState | null,
  buildDetected: (h: string, ids: string[], map: Map<string, InvItem>) => V2ColorVariant[]
): Set<string> {
  const taken = new Set<string>()
  for (const v of buildDetected(handle, candidateIds, invById)) {
    taken.add(v.variantKey)
  }
  for (const key of Object.keys(state?.rolesByVariant ?? {})) taken.add(key)
  for (const key of Object.keys(state?.galleriesByVariant ?? {})) taken.add(key)
  for (const a of state?.operatorVariantEdits?.added ?? []) taken.add(a.key)
  return taken
}

export function resolveOperatorVisibleLabel(
  variantKey: string,
  sourceDefaultLabel: string,
  state: V2ProductState | null | undefined
): string {
  const meta = state?.variantColorMeta?.[variantKey]
  if (meta?.labelEditedByOperator || meta?.createdByOperator) {
    return meta.label
  }
  const override = state?.variantLabelOverrides?.[variantKey]
  if (override) return override
  if (meta?.label) return meta.label
  return sourceDefaultLabel
}

export function syncVariantLabelOverridesFromMeta(
  state: V2ProductState
): Record<string, string> | undefined {
  const meta = state.variantColorMeta
  if (!meta || Object.keys(meta).length === 0) {
    return state.variantLabelOverrides
  }
  const overrides = { ...(state.variantLabelOverrides ?? {}) }
  for (const [key, entry] of Object.entries(meta)) {
    if (entry.labelEditedByOperator || entry.createdByOperator) {
      overrides[key] = entry.label
    }
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

export function mergeOperatorVariantEdits(
  fromDisk?: V2OperatorVariantEdits,
  fromMemory?: V2OperatorVariantEdits
): V2OperatorVariantEdits | undefined {
  if (!fromDisk && !fromMemory) return undefined
  const addedByKey = new Map<string, V2OperatorAddedVariant>()
  for (const a of fromDisk?.added ?? []) addedByKey.set(a.key, a)
  for (const a of fromMemory?.added ?? []) addedByKey.set(a.key, a)
  const removedByKey = new Map<string, import("./legacy-board-v2-types").V2OperatorRemovedVariant>()
  for (const r of fromDisk?.removed ?? []) removedByKey.set(r.key, r)
  for (const r of fromMemory?.removed ?? []) removedByKey.set(r.key, r)
  return {
    added: Array.from(addedByKey.values()),
    removed: Array.from(removedByKey.values()),
    default_variant_key:
      fromMemory?.default_variant_key ?? fromDisk?.default_variant_key,
  }
}

export function mergeVariantColorMeta(
  fromDisk?: Record<string, V2VariantColorMeta>,
  fromMemory?: Record<string, V2VariantColorMeta>
): Record<string, V2VariantColorMeta> | undefined {
  const merged = { ...(fromDisk ?? {}), ...(fromMemory ?? {}) }
  for (const [key, disk] of Object.entries(fromDisk ?? {})) {
    const mem = fromMemory?.[key]
    if (!mem) continue
    merged[key] = {
      ...disk,
      ...mem,
      label: mem.labelEditedByOperator || mem.createdByOperator ? mem.label : disk.label,
      labelEditedByOperator: mem.labelEditedByOperator || disk.labelEditedByOperator,
      createdByOperator: mem.createdByOperator || disk.createdByOperator,
      isCustom: mem.isCustom || disk.isCustom,
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

/** Apply operator labels onto merged variants (source defaults never win over operator). */
export function applyPersistedLabelsToVariants(
  variants: V2ColorVariant[],
  state: V2ProductState | null | undefined
): V2ColorVariant[] {
  if (!state) return variants
  return variants.map((v) => {
    const sourceLabel =
      state.variantColorMeta?.[v.variantKey]?.sourceLabel ??
      (v.source === "detected" ? v.label : undefined) ??
      v.label
    const label = resolveOperatorVisibleLabel(v.variantKey, sourceLabel, state)
    return { ...v, label }
  })
}

export function upsertSourceLabelMeta(
  state: V2ProductState,
  variantKey: string,
  sourceDefaultLabel: string
): V2ProductState {
  const meta = { ...(state.variantColorMeta ?? {}) }
  const existing = meta[variantKey]
  if (existing?.labelEditedByOperator || existing?.createdByOperator) {
    if (!existing.sourceLabel) {
      meta[variantKey] = { ...existing, sourceLabel: sourceDefaultLabel }
    }
    return { ...state, variantColorMeta: meta }
  }
  meta[variantKey] = {
    label: existing?.label ?? sourceDefaultLabel,
    sourceLabel: sourceDefaultLabel,
    labelEditedByOperator: existing?.labelEditedByOperator ?? false,
    createdByOperator: existing?.createdByOperator ?? isOperatorCustomVariantKey(variantKey),
    isCustom: existing?.isCustom ?? isOperatorCustomVariantKey(variantKey),
  }
  return { ...state, variantColorMeta: meta }
}

export function applyOperatorColorLabelChange(
  state: V2ProductState,
  variantKey: string,
  label: string,
  sourceDefaultLabel: string
): V2ProductState {
  const trimmed = label.trim()
  if (!trimmed) return state

  const now = new Date().toISOString()
  const meta = { ...(state.variantColorMeta ?? {}) }
  const prev = meta[variantKey]
  const isCustom = prev?.isCustom ?? isOperatorCustomVariantKey(variantKey)

  meta[variantKey] = {
    label: trimmed,
    sourceLabel: prev?.sourceLabel ?? sourceDefaultLabel,
    isCustom,
    createdByOperator: prev?.createdByOperator ?? isCustom,
    labelEditedByOperator: true,
    updatedAt: now,
  }

  const overrides = { ...(state.variantLabelOverrides ?? {}), [variantKey]: trimmed }

  const edits = {
    added: [...(state.operatorVariantEdits?.added ?? [])],
    removed: [...(state.operatorVariantEdits?.removed ?? [])],
    default_variant_key: state.operatorVariantEdits?.default_variant_key,
  }
  const addedIdx = edits.added.findIndex((a) => a.key === variantKey)
  if (addedIdx >= 0) {
    edits.added[addedIdx] = { ...edits.added[addedIdx]!, label: trimmed, source: "operator" }
  }

  return {
    ...state,
    variantColorMeta: meta,
    variantLabelOverrides: overrides,
    operatorVariantEdits: edits,
  }
}

export function migrateProductStateColorLabels(state: V2ProductState): V2ProductState {
  const meta: Record<string, V2VariantColorMeta> = { ...(state.variantColorMeta ?? {}) }

  for (const [key, label] of Object.entries(state.variantLabelOverrides ?? {})) {
    const existing = meta[key]
    if (existing?.labelEditedByOperator) continue
    meta[key] = {
      label,
      sourceLabel: existing?.sourceLabel ?? key,
      labelEditedByOperator: true,
      createdByOperator: existing?.createdByOperator ?? isOperatorCustomVariantKey(key),
      isCustom: existing?.isCustom ?? isOperatorCustomVariantKey(key),
      updatedAt: existing?.updatedAt,
    }
  }

  for (const added of state.operatorVariantEdits?.added ?? []) {
    const existing = meta[added.key]
    const label = state.variantLabelOverrides?.[added.key] ?? added.label
    meta[added.key] = {
      label,
      sourceLabel: existing?.sourceLabel ?? added.label,
      createdByOperator: true,
      isCustom: true,
      labelEditedByOperator:
        existing?.labelEditedByOperator ?? !!state.variantLabelOverrides?.[added.key],
      updatedAt: existing?.updatedAt,
    }
  }

  const next: V2ProductState = {
    ...state,
    variantColorMeta: Object.keys(meta).length > 0 ? meta : state.variantColorMeta,
  }
  const overrides = syncVariantLabelOverridesFromMeta(next)
  if (overrides) next.variantLabelOverrides = overrides
  return next
}

export function migratePersistedProductStates(
  productStates: Record<string, V2ProductState>
): Record<string, V2ProductState> {
  const out: Record<string, V2ProductState> = {}
  for (const [handle, state] of Object.entries(productStates)) {
    out[handle] = migrateProductStateColorLabels(state)
  }
  return out
}
