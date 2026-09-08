/**
 * Public product title contract for catalog cards + PDP.
 *
 * Goals:
 * - Prefer human identity (type + model) over raw Medusa title when canonical_name
 *   carries the model and title is a bare type / config stub.
 * - Preserve configuration cues already present in title (doors, drawers, size).
 * - Expand verified pedestal codes (ЯП/ПЯ/ЯЯ/ПП).
 * - Never invent materials, sizes, or model names.
 * - Keep SKU / legacy codes out of buyer-facing text.
 */

import {
  expandPedestalDeskCodeInTitle,
  extractPedestalDeskCode,
} from "./pedestal-desk-codes"
import {
  MOTIF_LEGACY_ENGLISH_TITLES,
  motifBuyerDisplayName,
} from "../motif-theme"

export type PublicTitleParts = {
  /** Final buyer-facing flat title. */
  public_title: string
  source:
    | "metadata.public_title"
    | "metadata.family_canonical_title"
    | "merged_title_canonical"
    | "canonical_name"
    | "title"
    | "fallback"
  legacy_title: string | null
  pedestal_code: string | null
  notes: string[]
}

export type PublicTitleInput = {
  title?: string | null
  handle?: string | null
  metadata?: Record<string, unknown> | null
}

/** Handle-prefix → collection (verified by product-copy / descriptions). */
const HANDLE_COLLECTION: Record<string, string> = {
  pv: "Provence",
  ol: "Oliver",
  co: "Country",
  gr: "Greenwich",
  greenwich: "Greenwich",
}

/** Config / size tokens that are NOT model names. */
const CONFIG_TAIL = new Set(
  [
    "ящиками",
    "ящиком",
    "дверкой",
    "зеркалом",
    "высокий",
    "высокая",
    "высокое",
    "механизмом",
    "изножья",
    "тканью",
    "справа",
    "слева",
    "сторон",
  ].map((s) => s.toLowerCase())
)

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}

function metaOf(product: PublicTitleInput): Record<string, unknown> {
  const m = product.metadata
  return m && typeof m === "object" && !Array.isArray(m) ? m : {}
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim()
}

/** Presentation-only: digit*digit → × (matches storefront formatBuyerFacingMeasureText). */
function polishMeasureStars(s: string): string {
  return s.replace(/(\d)\s*\*\s*(\d)/g, "$1 × $2")
}

function stripPedestalCode(s: string): string {
  return s.replace(/(?:^|[\s.])(ЯП|ПЯ|ЯЯ|ПП)\s*$/u, "").trim()
}

function collectionFromHandle(handle: string | null | undefined): string | null {
  if (!handle) return null
  const h = handle.trim().toLowerCase()
  if (h.startsWith("greenwich-")) return "Greenwich"
  const prefix = h.split("-")[0] ?? ""
  return HANDLE_COLLECTION[prefix] ?? null
}

/** Legacy CS-Cart depth/width/height tails that already live in structured data. */
const TECH_DIM_TAIL_RE =
  /\s*\(\s*(?:гл|шир|выс)\.?\s*\d+(?:\s*мм)?\s*\)\s*$/iu

function isWillieOrKidsTitleScope(meta: Record<string, unknown>): boolean {
  if (meta.storefront_section === "kids") return true
  return asString(meta.collection) === "willie-winkie"
}

function familyPaintValue(meta: Record<string, unknown>): string | null {
  const fam = meta.family_options
  if (!fam || typeof fam !== "object" || Array.isArray(fam)) return null
  const rec = fam as Record<string, unknown>
  return asString(rec["Роспись (мотив)"]) ?? asString(rec["Роспись"])
}

function hasSelectableMotif(meta: Record<string, unknown>): boolean {
  return Boolean(
    asString(meta.motif_slug) ||
      asString(meta.painting_name) ||
      asString(meta.motif) ||
      familyPaintValue(meta)
  )
}

function collectSelectableMotifPhrases(meta: Record<string, unknown>): string[] {
  const phrases: string[] = []
  const push = (s: string | null | undefined) => {
    const t = s?.trim()
    if (t) phrases.push(t)
  }
  push(asString(meta.painting_name))
  push(asString(meta.motif))
  push(asString(meta.motif_title))
  push(familyPaintValue(meta))
  const slug = asString(meta.motif_slug)
  if (slug) {
    push(motifBuyerDisplayName(slug))
    push(slug.replace(/-/g, " "))
    const slugNorm = slug.toLowerCase()
    for (const en of MOTIF_LEGACY_ENGLISH_TITLES) {
      const guess = en.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, "-")
      if (guess === slugNorm) push(en)
    }
  }
  const uniq = [...new Set(phrases)]
  uniq.sort((a, b) => b.length - a.length)
  return uniq
}

function stripWholePhrase(title: string, phrase: string): string {
  const escaped = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+")
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu")
  return title.replace(re, " ")
}

function tidyStrippedTitle(s: string): string {
  return s
    .replace(/\.\s*,/g, ".")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^[, \s]+|[, \s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

/**
 * Deterministic Kids / Willie Winkie title cleanup:
 * - drop `(гл. 440)` / `(шир. N)` / `(выс. N)` when already represented as options/dims
 * - drop the selectable painting name so H1 is the furniture type, not the motif
 *
 * Does not strip arbitrary parentheses. Adult titles are unchanged.
 */
export function stripLegacyKidsCatalogTitleNoise(
  title: string,
  meta: Record<string, unknown>
): { title: string; notes: string[] } {
  if (!isWillieOrKidsTitleScope(meta)) {
    return { title, notes: [] }
  }
  const notes: string[] = []
  let next = title
  const withoutDim = next.replace(TECH_DIM_TAIL_RE, "")
  if (withoutDim !== next) {
    next = withoutDim.trim()
    notes.push("stripped_technical_dimension_tail")
  }
  if (hasSelectableMotif(meta)) {
    for (const phrase of collectSelectableMotifPhrases(meta)) {
      const after = stripWholePhrase(next, phrase)
      if (after !== next) {
        next = after
        notes.push(`stripped_selectable_motif:${phrase}`)
      }
    }
  }
  next = tidyStrippedTitle(next)
  if (!next) {
    const family = asString(meta.family_canonical_title)
    if (family) {
      notes.push("fallback_family_canonical_title")
      return { title: family, notes }
    }
  }
  return { title: next || title, notes }
}

/**
 * Extract trailing Latin model token(s) from canonical_name
 * e.g. «Комод Scale» → Scale, «Прикроватная тумба Hole» → Hole.
 */
export function extractLatinModelName(canonical: string): string | null {
  const m = normalizeWhitespace(canonical).match(
    /^(.*?)\s+([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*)*)$/
  )
  if (!m?.[1] || !m[2]) return null
  if (!/[А-Яа-яЁё]/.test(m[1])) return null
  if (/\d/.test(m[2])) return null
  return m[2].trim()
}

/**
 * True when title already ends with a model-like proper name
 * (Latin or Cyrillic), so we must not append canonical Latin model.
 */
export function titleAlreadyHasModelName(title: string): boolean {
  const parts = normalizeWhitespace(title).split(/\s+/).filter(Boolean)
  if (!parts.length) return false
  const last = parts[parts.length - 1]!.replace(/[.,)]+$/u, "")
  if (/^[A-Za-z]/.test(last)) return true
  if (/^[А-ЯЁ][а-яё]+$/u.test(last) && !CONFIG_TAIL.has(last.toLowerCase())) {
    if (parts.length === 1) return false
    const TYPE_NOUNS = new Set([
      "комод",
      "консоль",
      "кровать",
      "тумба",
      "шкаф",
      "стол",
      "стеллаж",
      "зеркало",
      "гардероб",
    ])
    if (TYPE_NOUNS.has(last.toLowerCase())) return false
    return true
  }
  return false
}

function titleHasLatinModel(title: string, model: string): boolean {
  return title.toLowerCase().includes(model.toLowerCase())
}

function ensureCollectionInTitle(title: string, collection: string | null): string {
  if (!collection) return title
  if (new RegExp(collection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(title)) {
    return title
  }
  const paren = title.match(/^(.*?)(\s*\([^)]*\))\s*$/u)
  if (paren) {
    return `${paren[1]!.trim()} ${collection}${paren[2]}`
  }
  return `${title} ${collection}`
}

/**
 * Merge Medusa title (often config-rich) with canonical model name.
 */
export function resolvePublicProductTitle(product: PublicTitleInput): PublicTitleParts {
  const meta = metaOf(product)
  const notes: string[] = []
  const stored = asString(meta.public_title)
  const titleRaw = asString(product.title)
  const canonical = asString(meta.canonical_name)
  /* source_title is import provenance (TECH-WW-IMPORT-METADATA-01), not legacy_title. */
  const legacy = asString(meta.legacy_title) ?? titleRaw
  const collection =
    asString(meta.collection_label) ??
    asString(meta.collection) ??
    collectionFromHandle(product.handle)

  if (stored) {
    const expanded = expandPedestalDeskCodeInTitle(stored)
    return {
      public_title: polishMeasureStars(normalizeWhitespace(expanded.title)),
      source: "metadata.public_title",
      legacy_title: legacy,
      pedestal_code: expanded.code,
      notes: expanded.changed ? ["expanded_pedestal_code_in_public_title"] : [],
    }
  }

  let base = titleRaw ?? canonical ?? "Товар"
  let source: PublicTitleParts["source"] = titleRaw
    ? "title"
    : canonical
      ? "canonical_name"
      : "fallback"

  const model = canonical ? extractLatinModelName(canonical) : null
  if (
    model &&
    titleRaw &&
    !titleHasLatinModel(titleRaw, model) &&
    !titleAlreadyHasModelName(titleRaw)
  ) {
    const withoutCode = stripPedestalCode(titleRaw)
    base = `${withoutCode} ${model}`.replace(/\s+/g, " ").trim()
    source = "merged_title_canonical"
    notes.push(`merged_model:${model}`)
  } else if (!titleRaw && canonical) {
    base = canonical
    source = "canonical_name"
  } else if (model && titleRaw && titleAlreadyHasModelName(titleRaw)) {
    notes.push("skip_merge_title_has_model")
  }

  const stripped = stripLegacyKidsCatalogTitleNoise(base, meta)
  if (stripped.notes.length) {
    if (stripped.title !== base) base = stripped.title
    notes.push(...stripped.notes)
    if (stripped.notes.includes("fallback_family_canonical_title")) {
      source = "metadata.family_canonical_title"
    }
  }

  const expanded = expandPedestalDeskCodeInTitle(base)
  if (expanded.changed) {
    notes.push(`expanded_pedestal:${expanded.code}`)
  }

  let publicTitle = expanded.title
  if (expanded.code) {
    publicTitle = publicTitle.replace(/\b2-тумб\.?/giu, "двухтумбовый")
    notes.push("normalized_2_tumb_when_pedestal_expanded")
    const withCollection = ensureCollectionInTitle(publicTitle, collection)
    if (withCollection !== publicTitle) {
      publicTitle = withCollection
      notes.push(`added_collection:${collection}`)
    }
  }

  return {
    public_title: polishMeasureStars(normalizeWhitespace(publicTitle)),
    source,
    legacy_title: legacy,
    pedestal_code: expanded.code ?? extractPedestalDeskCode(base),
    notes,
  }
}

export const PUBLIC_TITLE_TRANSFORM_VERSION = "catalog-normalization-public-title-v2"
