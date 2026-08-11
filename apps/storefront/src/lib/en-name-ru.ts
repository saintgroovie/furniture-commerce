/**
 * Buyer-facing transcription of English proper names → Cyrillic.
 * Brand locks stay Latin: Woodright, Woodright Kids.
 */

/** Exact tokens / short phrases (case-insensitive match). */
const EXACT_NAME_RU: Record<string, string> = {
  hole: "Хоул",
  scale: "Скейл",
  step: "Степ",
  molly: "Молли",
  oxford: "Оксфорд",
  grace: "Грейс",
  nord: "Норд",
  cloud: "Клауд",
  nest: "Нест",
  buddy: "Бадди",
  sunny: "Санни",
  lily: "Лили",
  rose: "Роуз",
  bloom: "Блум",
  sky: "Скай",
  wave: "Вэйв",
  edge: "Эдж",
  soft: "Софт",
  pure: "Пьюр",
  line: "Лайн",
  mint: "Минт",
  pearl: "Пёрл",
  ivory: "Айвори",
  cocoa: "Какао",
  terra: "Терра",
  greenwich: "Гринвич",
  oliver: "Оливер",
  provence: "Прованс",
  monchelsea: "Мончелси",
  country: "Кантри",
  willie: "Вилли",
  winkie: "Винки",
  "willie winkie": "Вилли Винки",
  "willie-winkie": "Вилли Винки",
}

/** Never transliterate these (match longest first). */
const LATIN_LOCKS = ["Woodright Kids", "Woodright"].sort((a, b) => b.length - a.length)

const DIGRAPH_RU: Array<[string, string]> = [
  ["sch", "щ"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["zh", "ж"],
  ["kh", "х"],
  ["th", "т"],
  ["ph", "ф"],
  ["yo", "ё"],
  ["yu", "ю"],
  ["ya", "я"],
  ["ye", "е"],
  ["oo", "у"],
  ["ee", "и"],
  ["ou", "оу"],
  ["ow", "оу"],
  ["qu", "кв"],
]

const LETTER_RU: Record<string, string> = {
  a: "а",
  b: "б",
  c: "к",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "х",
  i: "и",
  j: "дж",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "к",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  w: "в",
  x: "кс",
  y: "и",
  z: "з",
}

function capitalizeRu(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Phonetic fallback for unknown Latin tokens (Title Case out). */
export function transliterateEnToken(token: string): string {
  const lower = token.toLowerCase()
  if (EXACT_NAME_RU[lower]) return EXACT_NAME_RU[lower]!

  let i = 0
  let out = ""
  const s = lower
  while (i < s.length) {
    let matched = false
    for (const [dig, ru] of DIGRAPH_RU) {
      if (s.startsWith(dig, i)) {
        out += ru
        i += dig.length
        matched = true
        break
      }
    }
    if (matched) continue
    const ch = s[i]!
    if (ch === "-" || ch === "'" || ch === "’" || ch === ".") {
      out += ch === "." ? "." : "-"
      i += 1
      continue
    }
    out += LETTER_RU[ch] ?? ch
    i += 1
  }

  // Common silent -e after consonant: Hole→Холe→Холе; dictionary covers Hole.
  // Soften trailing "e" after single consonant → drop when preceded by vowel+consonant.
  if (/[аеёиоуыэюя][бвгджзклмнпрстфхцчшщ]е$/i.test(out) && lower.endsWith("e") && lower.length <= 5) {
    out = out.slice(0, -1)
  }

  return capitalizeRu(out)
}

function isLatinLock(text: string): boolean {
  const t = text.trim()
  return LATIN_LOCKS.some((lock) => lock.toLowerCase() === t.toLowerCase())
}

/**
 * Replace Latin name tokens in a RU string with Cyrillic transcription.
 * Preserves Woodright / Woodright Kids in Latin.
 */
export function transcribeEnNamesInRuText(text: string): string {
  if (!text) return text
  let out = text

  // Protect brand locks with placeholders
  const held: string[] = []
  for (const lock of LATIN_LOCKS) {
    const re = new RegExp(lock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
    out = out.replace(re, () => {
      const key = `\uE000${held.length}\uE001`
      held.push(lock) // canonical Latin spelling
      return key
    })
  }

  // Multi-word exact dictionary first (willie winkie)
  const multi = Object.keys(EXACT_NAME_RU)
    .filter((k) => k.includes(" ") || k.includes("-"))
    .sort((a, b) => b.length - a.length)
  for (const key of multi) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-\\s]")}\\b`, "gi")
    out = out.replace(re, EXACT_NAME_RU[key]!)
  }

  // Single Latin tokens (ASCII letters, optional internal -/'/.)
  out = out.replace(/\b[A-Za-z][A-Za-z'’.-]*\b/g, (token) => {
    if (isLatinLock(token)) return token
    // Skip pure abbreviations like SKU fragments if very short all-caps with digits - already excluded
    return transliterateEnToken(token)
  })

  out = out.replace(/\uE000(\d+)\uE001/g, (_m, idx) => held[Number(idx)] ?? "")
  return out
}

export type BuyerFacingTitleLayout = {
  /** Flat title for SEO / cards: «Прикроватная тумба Хоул». */
  text: string
  /**
   * PDP H1 lines. Two lines only when the RU type is multi-word
   * (e.g. «Прикроватная тумба» / «Хоул»). Short titles stay one line
   * («Консоль Степ») — forced breaks looked like a CSS wrap bug.
   */
  lines: string[]
}

/**
 * Split «RU type + EN model» and transcribe the model.
 * No English model → one transcribed line (type only / full title).
 * Two-line H1 only when the type phrase has 2+ words.
 */
export function layoutBuyerFacingTitle(rawTitle: string): BuyerFacingTitleLayout {
  const cleaned = rawTitle
    .replace(/филенгками/gi, "филенками")
    .replace(/\/\s*филен/gi, " и филен")
    .replace(/\.\s*$/g, "")
    .trim()

  if (!cleaned) {
    return { text: "Товар", lines: ["Товар"] }
  }

  // Trailing Latin name run (Hole / Willie Winkie), not mixed SKUs with digits.
  const m = cleaned.match(
    /^(.*?)\s+([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*)*)$/
  )
  if (m?.[1] && m[2]) {
    const typePart = m[1].trim()
    const modelRaw = m[2].trim()
    if (typePart && /[А-Яа-яЁё]/.test(typePart)) {
      const modelRu = isLatinLock(modelRaw)
        ? modelRaw.replace(/\bwoodright kids\b/gi, "Woodright Kids").replace(/\bwoodright\b/gi, "Woodright")
        : transcribeEnNamesInRuText(modelRaw)
      const typeRu = transcribeEnNamesInRuText(typePart)
      const flat = `${typeRu} ${modelRu}`.trim()
      const typeWordCount = typeRu.split(/\s+/).filter(Boolean).length
      /* «Консоль Степ» fits one line; «Прикроватная тумба» / «Хоул» needs the
         meaning break so the long type does not fight the model name. */
      if (typeWordCount >= 2) {
        return { text: flat, lines: [typeRu, modelRu] }
      }
      return { text: flat, lines: [flat] }
    }
  }

  const text = transcribeEnNamesInRuText(cleaned)
  return { text, lines: [text] }
}
