/**
 * Russian UX typography helpers for storefront copy.
 * - Short prepositions/conjunctions get a trailing nbsp (no orphans at line end).
 * - «и / а / или» between two words: glue both sides so the conjunction cannot start a line.
 * - Fixed collocations (e.g. «мебель под проект») stay on one line as a unit.
 */

const HANGING_TOKENS = [
  "в",
  "во",
  "на",
  "с",
  "со",
  "к",
  "ко",
  "о",
  "об",
  "обо",
  "у",
  "и",
  "а",
  "но",
  "по",
  "из",
  "за",
  "от",
  "до",
  "для",
  "при",
  "без",
  "под",
  "над",
  "про",
  "через",
  "перед",
  "после",
  "не",
  "ни",
  "или",
  "либо",
  "что",
  "как",
  "же",
  "ли",
  "бы",
  "это",
  "все",
  "всё",
]

const HANGING_TOKEN = new RegExp(
  `(^|[\\s(«"„“])(${HANGING_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s+`,
  "gi"
)

/**
 * Multi-word units that must not wrap mid-phrase.
 * Longest first. Spaces inside become nbsp.
 */
const KEEP_TOGETHER_PHRASES = [
  "для взрослых и детских комнат",
  "комнаты целиком и работа по проекту",
  "мебель под проект",
  "мебель по проекту",
  "работа по проекту",
  "из массива",
  "по проекту",
  "под проект",
  "под ключ",
  "ручная роспись",
  "ручная отделка",
  "массив дерева",
  "выбор исполнения",
  "готовые модели",
  "готовые комнаты",
  "детские коллекции",
  "детская комната",
  "детской комнаты",
  "детских комнат",
].sort((a, b) => b.length - a.length)

/** «… под проект(у|ом|…)» / «… по проекту» - glue noun + prep + project word. */
const PROJECT_COLLOCATION =
  /([А-Яа-яЁёA-Za-z0-9-]+)\s+(под|по)\s+(проект(?:а|у|ом|е|ы|ов)?)(?=$|[^А-Яа-яЁёA-Za-z0-9-])/gi

/**
 * «взрослых и детских», «целиком и работа» - conjunction cannot start the next visual line.
 * Apply repeatedly so A и B и C chains glue left-to-right.
 */
const AND_COLLOCATION =
  /([А-Яа-яЁёA-Za-z0-9-]+)\s+(и|а|или)\s+([А-Яа-яЁёA-Za-z0-9-]+)/gi

function gluePhraseSpaces(phrase: string): string {
  return phrase.replace(/ /g, "\u00A0")
}

function applyKeepTogetherPhrases(text: string): string {
  let out = text
  for (const phrase of KEEP_TOGETHER_PHRASES) {
    const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
    out = out.replace(pattern, (match) => gluePhraseSpaces(match))
  }
  return out
}

function applyProjectCollocations(text: string): string {
  return text.replace(
    PROJECT_COLLOCATION,
    (_m, left: string, prep: string, project: string) =>
      `${left}\u00A0${prep}\u00A0${project}`
  )
}

function applyAndCollocations(text: string): string {
  let out = text
  let prev = ""
  // Chains like «A и B и C» need more than one pass.
  while (out !== prev) {
    prev = out
    out = out.replace(
      AND_COLLOCATION,
      (_m, left: string, conj: string, right: string) =>
        `${left}\u00A0${conj}\u00A0${right}`
    )
  }
  return out
}

/** Insert nbsp so short words and fixed phrases do not orphan on wrap. */
export function formatRuInline(text: string): string {
  if (!text) return text
  let out = applyKeepTogetherPhrases(text)
  out = applyProjectCollocations(out)
  out = applyAndCollocations(out)
  out = out.replace(HANGING_TOKEN, (_m, prefix: string, token: string) => `${prefix}${token}\u00A0`)
  return out
}

export type CopyBlock = string | readonly string[]

export function asCopyLines(value: CopyBlock): string[] {
  return typeof value === "string" ? [value] : [...value]
}

/** Flatten multi-line UX copy into one alert/string with inter-sentence periods only. */
export function flatCopy(value: CopyBlock): string {
  const lines = asCopyLines(value)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return ""
  if (lines.length === 1) return lines[0]!
  return lines
    .map((line, index) =>
      index < lines.length - 1 && !/[.!?…]$/.test(line) ? `${line}.` : line
    )
    .join(" ")
}
