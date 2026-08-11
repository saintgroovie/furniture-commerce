/**
 * Russian UX typography helpers for storefront copy.
 * - Short prepositions/conjunctions get a trailing nbsp (no orphans at line end).
 * - «и / а / или» between two words: glue both sides so the conjunction cannot start a line.
 * - Fixed collocations (e.g. «мебель под проект») stay on one line as a unit.
 * - Measure amounts («124 см») stay on one line; Cyrillic units must not use ASCII `\b`.
 * - Count numerals in words → digits («двенадцать отделок» → «12 отделок»).
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
  "следующий шаг",
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
  /* PDP measure / finish collocations */
  "по фронту",
  "при высоте",
  "при ширине",
  "при глубине",
  "в ширину",
  "в высоту",
  "в глубину",
  "в длину",
  "тон в тон",
  "цветовой акцент",
  "проходные зоны",
  "зона у окна",
  "под полноценный стол",
].sort((a, b) => b.length - a.length)

/**
 * «124 см» / «63,5 мм» - number and unit stay on one line.
 * Do not use ASCII `\b` after Cyrillic units - JS word chars are A-Za-z0-9_ only,
 * so `\b` never matches after «см» and the glue silently fails.
 */
const MEASURE_UNIT =
  /(\d+(?:[.,]\d+)?)\s+(см|мм|м)(?=$|[^\p{L}\p{N}])/giu

/**
 * Cardinal number-words → digits (counts in buyer-facing copy).
 * Longest / most-specific forms first. Unicode letter boundaries only.
 * Ordinals («первый», «второй») are left as words.
 */
const RU_COUNT_NUMERALS: Array<[string, string]> = [
  ["двадцать", "20"],
  ["девятнадцать", "19"],
  ["восемнадцать", "18"],
  ["семнадцать", "17"],
  ["шестнадцать", "16"],
  ["пятнадцать", "15"],
  ["четырнадцать", "14"],
  ["тринадцать", "13"],
  ["двенадцати", "12"],
  ["двенадцать", "12"],
  ["одиннадцати", "11"],
  ["одиннадцать", "11"],
  ["десяти", "10"],
  ["десять", "10"],
  ["девяти", "9"],
  ["девять", "9"],
  ["восьми", "8"],
  ["восемь", "8"],
  ["семи", "7"],
  ["семь", "7"],
  ["шести", "6"],
  ["шесть", "6"],
  ["пяти", "5"],
  ["пять", "5"],
  ["четырёх", "4"],
  ["четырех", "4"],
  ["четыре", "4"],
  ["трёх", "3"],
  ["трех", "3"],
  ["три", "3"],
  ["двумя", "2"],
  ["двух", "2"],
  ["двум", "2"],
  ["две", "2"],
  ["два", "2"],
]

const RU_COUNT_NUMERAL = new RegExp(
  `(?<![\\p{L}\\p{N}])(${RU_COUNT_NUMERALS.map(([w]) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ).join("|")})(?![\\p{L}\\p{N}])`,
  "giu"
)

const RU_COUNT_DIGIT = new Map(
  RU_COUNT_NUMERALS.map(([word, digit]) => [word.toLowerCase(), digit])
)

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

/** Buyer-facing counts: «двенадцать отделок» → «12 отделок». */
function applyRuCountDigits(text: string): string {
  return text.replace(RU_COUNT_NUMERAL, (match) => {
    const digit = RU_COUNT_DIGIT.get(match.toLowerCase())
    return digit ?? match
  })
}

function applyMeasureUnits(text: string): string {
  return text.replace(
    MEASURE_UNIT,
    (_m, num: string, unit: string) => `${num}\u00A0${unit}`
  )
}

/**
 * Number+unit alone is not enough: the axis role is part of the same thought.
 * «119 см» at the end of a line and «в длину» on the next reads as a broken
 * measure - wrap the whole «119 см в длину» / «при высоте 90 см» as one unit
 * so the amount moves with its role.
 */
function applyMeasureRoles(text: string): string {
  let out = text.replace(
    /(\d+(?:[.,]\d+)?)\u00A0(см|мм|м)[ \u00A0]+в[ \u00A0]+(длину|ширину|высоту|глубину)/giu,
    (_m, num: string, unit: string, axis: string) =>
      `${num}\u00A0${unit}\u00A0в\u00A0${axis}`
  )
  out = out.replace(
    /при[ \u00A0]+(высоте|ширине|глубине|длине)[ \u00A0]+(\d+(?:[.,]\d+)?)\u00A0(см|мм|м)/giu,
    (_m, axis: string, num: string, unit: string) =>
      `при\u00A0${axis}\u00A0${num}\u00A0${unit}`
  )
  return out
}

/** Insert nbsp so short words and fixed phrases do not orphan on wrap. */
export function formatRuInline(text: string): string {
  if (!text) return text
  let out = applyRuCountDigits(text)
  out = applyKeepTogetherPhrases(out)
  out = applyProjectCollocations(out)
  out = applyAndCollocations(out)
  out = applyMeasureUnits(out)
  out = applyMeasureRoles(out)
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
