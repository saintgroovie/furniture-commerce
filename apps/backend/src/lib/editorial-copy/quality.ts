/**
 * Editorial copy quality checks (corpus-level and per text).
 * Pure - used by the board generator and its tests; never at storefront runtime.
 */
import { SHARED_EXECUTION_NOTE } from "../catalog-normalization/buyer-description"

/** Owner-banned clichés (lowercase; «ё» folded to «е» before matching). */
export const BANNED_PHRASES = [
  "идеальный выбор",
  "прекрасно подойдет",
  "гармонично впишется",
  "стильное решение",
  "функциональное решение",
  "сочетает в себе",
  "создаст уют",
  "атмосфера уюта",
  "изысканный дизайн",
  "не оставит равнодушным",
  "высокое качество",
  "воплощение",
  "идеальное сочетание",
  "для вашего малыша",
  "станет украшением интерьера",
] as const

/** Search / sales vocabulary that does not belong in a product description. */
export const SEO_WORD_RES: RegExp[] = [
  /(?<![\p{L}])купить(?![\p{L}])/iu,
  /(?<![\p{L}])цен[аыеу](?![\p{L}])/iu,
  /(?<![\p{L}])москв/iu,
  /интернет-магазин/iu,
  /заказать мебель/iu,
]

/** Lead times, delivery, warranty and payment promises are governed by the commercial SoT. */
const COMMERCIAL_RES: RegExp[] = [
  /(?<![\p{L}])срок/iu,
  /(?<![\p{L}])доставк/iu,
  /(?<![\p{L}])гаранти/iu,
  /(?<![\p{L}])оплат/iu,
  /(?<![\p{L}])рассрочк/iu,
]

const LATIN_WORD_RE = /[A-Za-z]{3,}/
const RAW_DIMENSION_RE = /\d[\d\s,.]*\s?(?:см|мм|м)(?![\p{L}])|\d+\s*[×xх*]\s*\d+/u
const SKU_RE = /(?<![\p{L}\p{N}])(?:[A-Z]{1,4}-\d{2}(?:-\d+)?|[a-z]{2,4}-\d{2}-\d+)(?![\p{L}\p{N}])/u
const PRICE_CELL_RE = /ячейка прайса|Порядок:\s*высота/iu
const OPENING_MODEL_RE = /^Модель\s.+\sиз коллекции/u
const INFANTILE_RE = /малыш|кроха|деткам/iu

export type CopyIssue =
  | "banned_phrase"
  | "seo_word"
  | "commercial_claim"
  | "latin_word"
  | "raw_dimension"
  | "sku_code"
  | "ascii_ellipsis"
  | "long_dash"
  | "shared_note"
  | "price_cell"
  | "title_echo"
  | "opening_model_template"
  | "infantile"
  | "too_short"
  | "too_long"
  | "empty"

export const COPY_MIN_LENGTH = 150
export const COPY_MAX_LENGTH = 900

function fold(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[\u00a0\u202f]/g, " ")
}

export function normalizeForCompare(s: string): string {
  return fold(s).replace(/\s+/g, " ").replace(/[.\s]+$/u, "").trim()
}

export function findBannedPhrases(text: string): string[] {
  const t = fold(text)
  return BANNED_PHRASES.filter((p) => t.includes(p))
}

export function findCopyIssues(
  text: string | null | undefined,
  ctx: { title?: string | null; minLength?: number } = {}
): CopyIssue[] {
  if (typeof text !== "string" || !text.trim()) return ["empty"]
  const issues: CopyIssue[] = []
  const add = (i: CopyIssue) => {
    if (!issues.includes(i)) issues.push(i)
  }
  if (findBannedPhrases(text).length) add("banned_phrase")
  if (SEO_WORD_RES.some((re) => re.test(text))) add("seo_word")
  if (COMMERCIAL_RES.some((re) => re.test(text))) add("commercial_claim")
  if (LATIN_WORD_RE.test(text.replace(/Woodright/g, ""))) add("latin_word")
  if (RAW_DIMENSION_RE.test(text)) add("raw_dimension")
  if (SKU_RE.test(text)) add("sku_code")
  if (text.includes("...")) add("ascii_ellipsis")
  if (/[—–]/.test(text)) add("long_dash")
  if (normalizeForCompare(text).includes(normalizeForCompare(SHARED_EXECUTION_NOTE))) add("shared_note")
  if (PRICE_CELL_RE.test(text)) add("price_cell")
  if (ctx.title) {
    const first = normalizeForCompare(text.split(/\n+/)[0] ?? "")
    const title = normalizeForCompare(ctx.title)
    if (title && (first === title || first.startsWith(`${title}:`) || first.startsWith(`${title} -`))) add("title_echo")
  }
  if (OPENING_MODEL_RE.test(text.trim())) add("opening_model_template")
  if (INFANTILE_RE.test(text)) add("infantile")
  const len = text.replace(/\s+/g, " ").trim().length
  if (len < (ctx.minLength ?? COPY_MIN_LENGTH)) add("too_short")
  if (len > COPY_MAX_LENGTH) add("too_long")
  return issues
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

export function splitSentences(text: string): string[] {
  return splitParagraphs(text).flatMap((p) =>
    p
      .split(/(?<=[.!?…])\s+(?=[«"(А-ЯЁA-Z0-9])/u)
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

export function words(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}]+/gu) ?? []
}

export type CorpusEntry = { key: string; family: string; text: string }

export type RepeatRow = { text: string; occurrences: number; families: string[]; keys: string[] }

function collect(
  entries: CorpusEntry[],
  pick: (e: CorpusEntry) => string[]
): Map<string, { keys: Set<string>; families: Set<string>; occurrences: number; sample: string }> {
  const map = new Map<string, { keys: Set<string>; families: Set<string>; occurrences: number; sample: string }>()
  for (const e of entries) {
    for (const raw of pick(e)) {
      const k = normalizeForCompare(raw)
      if (!k) continue
      const slot = map.get(k) ?? { keys: new Set(), families: new Set(), occurrences: 0, sample: raw }
      slot.keys.add(e.key)
      slot.families.add(e.family)
      slot.occurrences += 1
      map.set(k, slot)
    }
  }
  return map
}

function toRows(
  map: ReturnType<typeof collect>,
  minFamilies: number,
  limit: number
): RepeatRow[] {
  return [...map.values()]
    .filter((v) => v.families.size >= minFamilies)
    .map((v) => ({
      text: v.sample,
      occurrences: v.occurrences,
      families: [...v.families].sort(),
      keys: [...v.keys].sort(),
    }))
    .sort((a, b) => b.families.length - a.families.length || b.occurrences - a.occurrences || a.text.localeCompare(b.text))
    .slice(0, limit)
}

function ngrams(text: string, n: number): string[] {
  const out: string[] = []
  for (const p of splitParagraphs(text)) {
    const w = words(p)
    for (let i = 0; i + n <= w.length; i += 1) out.push(w.slice(i, i + n).join(" "))
  }
  return out
}

function lastWords(text: string, n: number): string[] {
  return splitSentences(text).map((s) => words(s).slice(-n).join(" ")).filter((s) => s.split(" ").length === n)
}

export type RepetitionReport = {
  repeated_sentences: RepeatRow[]
  repeated_first_sentences: RepeatRow[]
  top_trigrams: RepeatRow[]
  top_fourgrams: RepeatRow[]
  repeated_endings: RepeatRow[]
}

/**
 * Repetition across content families. A sentence shared inside one variant family is by design,
 * so every list counts distinct families and keeps rows that span at least 2 of them.
 */
export function repetitionReport(entries: CorpusEntry[], limit = 40): RepetitionReport {
  return {
    repeated_sentences: toRows(collect(entries, (e) => splitSentences(e.text)), 2, limit),
    repeated_first_sentences: toRows(collect(entries, (e) => splitSentences(e.text).slice(0, 1)), 2, limit),
    top_trigrams: toRows(collect(entries, (e) => [...new Set(ngrams(e.text, 3))]), 3, limit),
    top_fourgrams: toRows(collect(entries, (e) => [...new Set(ngrams(e.text, 4))]), 3, limit),
    repeated_endings: toRows(collect(entries, (e) => [...new Set(lastWords(e.text, 3))]), 3, limit),
  }
}

function shingles(text: string, n = 3): Set<string> {
  const w = words(text)
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(" "))
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return inter / (a.size + b.size - inter)
}

export type DuplicateGroup = { keys: string[]; families: string[]; similarity: number }

/**
 * Exact (identical normalized text) and near (3-word shingle Jaccard >= threshold) duplicate groups.
 * `crossFamilyOnly` ignores pairs from the same content family (shared variant copy).
 */
export function duplicateGroups(
  entries: CorpusEntry[],
  opts: { threshold?: number; crossFamilyOnly?: boolean } = {}
): { exact: DuplicateGroup[]; near: DuplicateGroup[] } {
  const threshold = opts.threshold ?? 0.75
  const valid = entries.filter((e) => e.text.trim())
  const exactMap = new Map<string, CorpusEntry[]>()
  for (const e of valid) {
    const k = normalizeForCompare(e.text)
    exactMap.set(k, [...(exactMap.get(k) ?? []), e])
  }
  const exact: DuplicateGroup[] = [...exactMap.values()]
    .filter((g) => g.length > 1 && (!opts.crossFamilyOnly || new Set(g.map((e) => e.family)).size > 1))
    .map((g) => ({
      keys: g.map((e) => e.key).sort(),
      families: [...new Set(g.map((e) => e.family))].sort(),
      similarity: 1,
    }))
    .sort((a, b) => a.keys[0].localeCompare(b.keys[0]))

  const sh = valid.map((e) => shingles(e.text))
  const parent = valid.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const best = new Map<string, number>()
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      if (opts.crossFamilyOnly && valid[i].family === valid[j].family) continue
      if (normalizeForCompare(valid[i].text) === normalizeForCompare(valid[j].text)) continue
      const s = jaccard(sh[i], sh[j])
      if (s >= threshold) {
        const a = find(i)
        const b = find(j)
        if (a !== b) parent[a] = b
        best.set(`${i}:${j}`, s)
      }
    }
  }
  const groups = new Map<number, number[]>()
  for (const key of best.keys()) {
    const [i, j] = key.split(":").map(Number)
    for (const x of [i, j]) {
      const root = find(x)
      const list = groups.get(root) ?? []
      if (!list.includes(x)) list.push(x)
      groups.set(root, list)
    }
  }
  const near: DuplicateGroup[] = [...groups.values()]
    .map((idx) => {
      let sim = 0
      for (const [k, v] of best) {
        const [i, j] = k.split(":").map(Number)
        if (idx.includes(i) && idx.includes(j)) sim = Math.max(sim, v)
      }
      return {
        keys: idx.map((i) => valid[i].key).sort(),
        families: [...new Set(idx.map((i) => valid[i].family))].sort(),
        similarity: Math.round(sim * 100) / 100,
      }
    })
    .sort((a, b) => a.keys[0].localeCompare(b.keys[0]))
  return { exact, near }
}
