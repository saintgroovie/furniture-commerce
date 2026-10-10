/**
 * Buyer title phrasing (public-title v4).
 *
 * Turns price-list titles («Стол письменный 1-тумб. 0П», «Кровать 2-сп. (160×200)»)
 * into buyer names: `<тип> <модель> <уточнение>`.
 *
 * - Closed dictionary only: unknown titles keep their wording.
 * - The model is the product's own collection (metadata / family key / handle).
 *   Nothing is added when the title already names a model or collection.
 * - Single-pedestal desk codes are expanded only from the structured
 *   `pedestal_filling` convention (Я = ящики, П = полки, 0 = без тумбы).
 * - Never invents materials, sizes, colours or purpose.
 */

/** RU model name used inside buyer titles, keyed by collection slug. */
export const COLLECTION_TITLE_NAME_RU: Record<string, string> = {
  oliver: "Оливер",
  "oliver-kids": "Оливер",
  provence: "Прованс",
  country: "Кантри",
  "country-london-paris": "Кантри",
  greenwich: "Гринвич",
  monchelsea: "Мончелси",
  "princess-rose": "Принцесса Роза",
  "willie-winkie": "Вилли Винки",
  oxford: "Оксфорд",
}

/** Latin spellings that already identify the collection inside a title. */
const COLLECTION_LATIN_NAMES: Record<string, string[]> = {
  oliver: ["Oliver"],
  "oliver-kids": ["Oliver"],
  provence: ["Provence"],
  country: ["Country"],
  "country-london-paris": ["Country"],
  greenwich: ["Greenwich"],
  monchelsea: ["Monchelsea"],
  "princess-rose": ["Princess Rose"],
  "willie-winkie": ["Willie Winkie"],
  oxford: ["Oxford"],
}

const HANDLE_PREFIX_COLLECTION: Record<string, string> = {
  ol: "oliver",
  pv: "provence",
  co: "country-london-paris",
  gr: "greenwich",
  greenwich: "greenwich",
  mnm: "monchelsea",
  mn: "monchelsea",
  pr: "princess-rose",
  ox: "oxford",
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[·•]/g, " ")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
}

/**
 * Collection slug for the title model.
 * Order: metadata.collection → family_key / workbook_row_key prefix → handle prefix.
 */
export function resolveTitleCollectionSlug(
  handle: string | null | undefined,
  meta: Record<string, unknown>
): string | null {
  const candidates = [
    asString(meta.collection),
    asString(meta.family_key)?.split(":")[0] ?? null,
    asString(meta.workbook_row_key)?.split(":")[0] ?? null,
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const slug = normalizeSlug(raw)
    if (COLLECTION_TITLE_NAME_RU[slug]) return slug
  }
  const h = asString(handle)?.toLowerCase()
  if (!h) return null
  if (h.startsWith("greenwich-")) return "greenwich"
  const prefix = h.split("-")[0] ?? ""
  return HANDLE_PREFIX_COLLECTION[prefix] ?? null
}

export function collectionTitleName(slug: string | null): string | null {
  if (!slug) return null
  return COLLECTION_TITLE_NAME_RU[slug] ?? null
}

/* ------------------------------------------------------------------ */
/* Single-pedestal desk codes                                          */
/* ------------------------------------------------------------------ */

export type SinglePedestalDeskCode = "Я0" | "0Я" | "П0" | "0П"

/**
 * Evidence: metadata.pedestal_filling on pv-65-5…8 and co-65-1/2
 * (left/right ∈ DRAWERS | SHELVES | EMPTY, legacy_code mirrors the title).
 */
export const SINGLE_PEDESTAL_DESK_CODE_MAP: Record<
  SinglePedestalDeskCode,
  { public_phrase: string; sample_handles: string[] }
> = {
  Я0: { public_phrase: "тумба с ящиками слева", sample_handles: ["pv-65-8"] },
  "0Я": { public_phrase: "тумба с ящиками справа", sample_handles: ["pv-65-7"] },
  П0: { public_phrase: "тумба с полками слева", sample_handles: ["pv-65-6"] },
  "0П": { public_phrase: "тумба с полками справа", sample_handles: ["pv-65-5", "co-65-1"] },
}

/** Legacy single-pedestal codes use Latin O / Cyrillic О for zero in some rows. */
const SINGLE_CODE_RE = /(1-тумб\.?)\s*([ЯП][0OО]|[0OО][ЯП])(?=$|[\s(,])/u
/** Two-pedestal codes followed by a parenthetical (e.g. «ЯП (ручки Swarovski)»). */
const DOUBLE_CODE_BEFORE_PAREN_RE = /(2-тумб\.?)\s*(ЯП|ПЯ|ЯЯ|ПП)\s*(?=$|\()/u

const DOUBLE_CODE_PHRASE: Record<string, string> = {
  ЯП: "ящики слева, полки справа",
  ПЯ: "полки слева, ящики справа",
  ЯЯ: "ящики с обеих сторон",
  ПП: "полки с обеих сторон",
}

function normalizeSingleCode(raw: string): SinglePedestalDeskCode | null {
  const code = raw.replace(/[OО]/gu, "0")
  return code in SINGLE_PEDESTAL_DESK_CODE_MAP
    ? (code as SinglePedestalDeskCode)
    : null
}

/** Pull desk code phrases into the qualifier list; leaves the rest of the title. */
function extractDeskCodePhrases(title: string): { title: string; phrases: string[] } {
  const phrases: string[] = []
  let next = title
  const single = next.match(SINGLE_CODE_RE)
  if (single?.[2]) {
    const code = normalizeSingleCode(single[2])
    if (code) {
      phrases.push(SINGLE_PEDESTAL_DESK_CODE_MAP[code].public_phrase)
      next = next.replace(SINGLE_CODE_RE, "$1")
    }
  }
  const double = next.match(DOUBLE_CODE_BEFORE_PAREN_RE)
  if (double?.[2]) {
    phrases.push(DOUBLE_CODE_PHRASE[double[2]]!)
    next = next.replace(DOUBLE_CODE_BEFORE_PAREN_RE, "$1 ")
  }
  return { title: next.replace(/\s{2,}/g, " ").trim(), phrases }
}

/* ------------------------------------------------------------------ */
/* Type head dictionary                                                */
/* ------------------------------------------------------------------ */

/** `tail` replaces the matched qualifier that belongs after the model. */
type HeadRule = { re: RegExp; head: string; tail?: string }

/**
 * Price-list head → natural buyer head. Longest / most specific first.
 * Each regex is anchored at the start and consumes only the type phrase.
 */
const HEAD_RULES: HeadRule[] = [
  { re: /^Кровать\s+1-сп\.?/u, head: "Односпальная кровать" },
  { re: /^Кровать\s+1,5-сп\.?/u, head: "Полутораспальная кровать" },
  { re: /^Кровать\s+2-сп\.?/u, head: "Двуспальная кровать" },
  { re: /^Кровать\s*-\s*трансформер/u, head: "Кровать-трансформер" },
  { re: /^Кроватка для новорожденного/u, head: "Кроватка для новорождённого" },
  { re: /^Кроватка приставная\s*\+\s*матрас/u, head: "Приставная кроватка", tail: "с матрасом" },
  { re: /^Кроватка приставная/u, head: "Приставная кроватка" },
  {
    re: /^Нижняя кровать без матраса увеличенная/u,
    head: "Увеличенная нижняя кровать",
    tail: "без матраса",
  },
  { re: /^Диван-кровать малый/u, head: "Малый диван-кровать" },
  { re: /^Диван малый/u, head: "Малый диван" },
  { re: /^Диван большой/u, head: "Большой диван" },
  { re: /^Шкаф для одежды\s+2-дв\.?,?\s+высокий/u, head: "Высокий двухдверный шкаф для одежды" },
  { re: /^Шкаф для одежды\s+1-дв\.?/u, head: "Однодверный шкаф для одежды" },
  { re: /^Шкаф для одежды\s+2-дв\.?/u, head: "Двухдверный шкаф для одежды" },
  { re: /^Шкаф для одежды\s+3-дв\.?/u, head: "Трёхдверный шкаф для одежды" },
  { re: /^Шкаф для одежды\s+4-дв\.?/u, head: "Четырёхдверный шкаф для одежды" },
  { re: /^Шкаф книжный\s+1-дв\.?/u, head: "Однодверный книжный шкаф" },
  { re: /^Шкаф книжный\s+2-дв\.?/u, head: "Двухдверный книжный шкаф" },
  { re: /^Шкаф книжный/u, head: "Книжный шкаф" },
  { re: /^Шкаф угловой/u, head: "Угловой шкаф" },
  { re: /^Шкаф буфетный/u, head: "Буфетный шкаф" },
  { re: /^Шкаф кабинетный/u, head: "Кабинетный шкаф" },
  { re: /^Комод столовый/u, head: "Столовый комод" },
  { re: /^Гардероб\s+2-дв\.?/u, head: "Двухдверный гардероб" },
  { re: /^Гардероб\s+3-дв\.?/u, head: "Трёхдверный гардероб" },
  { re: /^Стол кабинетный письменный двухтумбовый/u, head: "Двухтумбовый кабинетный стол" },
  { re: /^Стол письменный\s+(?:2-тумб\.?|двухтумбовый)/u, head: "Двухтумбовый письменный стол" },
  { re: /^Стол письменный\s+1-тумб\.?/u, head: "Однотумбовый письменный стол" },
  { re: /^Стол письменный/u, head: "Письменный стол" },
  { re: /^Стол обеденный раздвижной/u, head: "Раздвижной обеденный стол" },
  { re: /^Стол обеденный/u, head: "Обеденный стол" },
  { re: /^Стол рабочий/u, head: "Рабочий стол" },
  { re: /^Столик\s+туалетный/u, head: "Туалетный столик" },
  { re: /^Столик\s+детский/u, head: "Детский столик" },
  { re: /^Столик\s+чайный\s+круглый/u, head: "Круглый чайный столик" },
  { re: /^Столик\s+чайный/u, head: "Чайный столик" },
  { re: /^Столик\s+журнальный/u, head: "Журнальный столик" },
  { re: /^Стульчик\s+детский/u, head: "Детский стульчик" },
  { re: /^Тумбочка прикроватная/u, head: "Прикроватная тумба" },
  { re: /^Зеркало навесное овальное/u, head: "Овальное навесное зеркало" },
  { re: /^Зеркало навесное/u, head: "Навесное зеркало" },
  { re: /^Зеркало напольное/u, head: "Напольное зеркало" },
  { re: /^Зеркало настольное/u, head: "Настольное зеркало" },
  { re: /^Полка книжная малая/u, head: "Малая книжная полка" },
  { re: /^Полка книжная угловая/u, head: "Угловая книжная полка" },
  { re: /^Полка книжная\s+1-ярусная/u, head: "Одноярусная книжная полка" },
  { re: /^Полка книжная\s+2-ярусная/u, head: "Двухъярусная книжная полка" },
  { re: /^Полка книжная\s+3-ярусная/u, head: "Трёхъярусная книжная полка" },
  { re: /^Полка книжная/u, head: "Книжная полка" },
  { re: /^Полка навесная/u, head: "Навесная полка" },
  { re: /^Комод высокий/u, head: "Высокий комод" },
  { re: /^Комод широкий/u, head: "Широкий комод" },
  { re: /^Комод стандартный/u, head: "Стандартный комод" },
  { re: /^Стеллаж для книг высокий/u, head: "Высокий стеллаж для книг" },
  { re: /^Стеллаж широкий/u, head: "Широкий стеллаж" },
  { re: /^Стеллаж узкий/u, head: "Узкий стеллаж" },
  { re: /^Этажерка большая/u, head: "Большая этажерка" },
  { re: /^Этажерка малая/u, head: "Малая этажерка" },
  { re: /^Банкетка большая/u, head: "Большая банкетка" },
  { re: /^Банкетка малая/u, head: "Малая банкетка" },
  { re: /^Бортик к кровати большой/u, head: "Большой бортик к кровати" },
  { re: /^Бортик к кровати малый/u, head: "Малый бортик к кровати" },
  { re: /^Секция угловая открытая/u, head: "Открытая угловая секция" },
  { re: /^Столешница пеленальная съемная/u, head: "Съёмная пеленальная столешница" },
]

/** Generic type nouns that may start a title without a dictionary match. */
const TYPE_NOUN_RE =
  /^(?:Комод|Консоль|Кровать|Тумба|Шкаф(?:-витрина)?|Стол(?:-бюро)?|Столик|Стул|Стульчик|Стеллаж|Зеркало|Гардероб|Диван(?:-кровать)?|Кресло|Каркас|Сундук|Часы|Полка|Этажерка|Банкетка|Бортик|Секция|Кроватка|Комплекс|Столешница|Ступени)(?![\p{L}])/u

/* ------------------------------------------------------------------ */
/* Cleanup                                                             */
/* ------------------------------------------------------------------ */

/** Import truncations and punctuation noise that are safe to repair. */
export function repairLegacyTitleNoise(title: string): string {
  return title
    .replace(/\u00a0/g, " ")
    .replace(/без\s+изн(?![а-яё])\.?/giu, "без изножья")
    .replace(/,(?=[^\s\d])/gu, ", ")
    .replace(/\s+,/gu, ",")
    /* «1,5-сп.140*190» → «1,5-сп. (140*190)»: bare bed size joins the other rows' format. */
    .replace(/(-сп\.?)\s*(\d{2,3}\s*[*×xх]\s*\d{2,3})(?!\s*\))/u, "$1 ($2)")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function stripParentheticals(s: string): string {
  return s.replace(/\([^)]*\)/gu, " ")
}

/**
 * True when the title (outside parentheses) already carries a model or
 * collection name: any Latin word, the collection's RU/Latin name, or a
 * capitalised Cyrillic proper name after the first word.
 */
export function titleNamesModel(title: string, collectionSlug: string | null): boolean {
  const outside = stripParentheticals(title)
  if (/[A-Za-z]{2,}/.test(outside)) return true
  const names = [
    collectionTitleName(collectionSlug),
    ...(collectionSlug ? COLLECTION_LATIN_NAMES[collectionSlug] ?? [] : []),
  ].filter((n): n is string => Boolean(n))
  for (const name of names) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRe(name)}`, "iu")
    if (re.test(title)) return true
  }
  const words = outside.split(/\s+/).filter(Boolean)
  return words.slice(1).some((w) => /^[А-ЯЁ][а-яё]+(?:-\d+)?[.,]?$/u.test(w))
}

function splitTrailingParen(s: string): { body: string; paren: string | null } {
  const m = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/u)
  if (!m) return { body: s, paren: null }
  return { body: m[1]!.trim(), paren: m[2]!.trim() }
}

function joinQualifiers(rest: string): string {
  const r = rest.trim()
  if (!r) return ""
  /* «6 полок» / «90 × 190» after the model read as a separate clause. */
  if (/^\d/.test(r)) return `, ${r}`
  return ` ${r}`
}

export type BuyerTitlePhrasingResult = {
  title: string
  notes: string[]
}

/**
 * Apply phrasing to an already-resolved public title.
 * `collectionSlug` is the product's own collection (or null → no model insert).
 */
export function phraseBuyerTitle(
  rawTitle: string,
  collectionSlug: string | null
): BuyerTitlePhrasingResult {
  const notes: string[] = []
  let title = repairLegacyTitleNoise(rawTitle)
  if (title !== rawTitle.trim()) notes.push("repaired_legacy_noise")

  const { body: bodyRaw, paren } = splitTrailingParen(title)
  const desk = extractDeskCodePhrases(bodyRaw)
  let body = desk.title
  const parenParts = [...desk.phrases, ...(paren ? [paren] : [])]
  if (desk.phrases.length) notes.push("expanded_desk_code")

  let head: string | null = null
  let rest = body
  for (const rule of HEAD_RULES) {
    const m = body.match(rule.re)
    /* A rule must end on a token boundary: «1-сп» must not eat «1-спальная». */
    if (m && !/^[\p{L}\p{N}]/u.test(body.slice(m[0].length))) {
      head = rule.head
      rest = [rule.tail ?? "", body.slice(m[0].length).replace(/^[\s.,]+/u, "")]
        .join(" ")
        .trim()
      notes.push("phrased_type_head")
      break
    }
  }

  const modelName = collectionTitleName(collectionSlug)
  const assembledForCheck = [
    head ?? body,
    head ? rest : "",
    parenParts.length ? `(${parenParts.join(", ")})` : "",
  ].join(" ")
  const needsModel =
    modelName != null && !titleNamesModel(assembledForCheck, collectionSlug)

  if (head) {
    body = needsModel
      ? `${head} ${modelName}${joinQualifiers(rest)}`
      : `${head}${joinQualifiers(rest)}`
  } else if (needsModel && TYPE_NOUN_RE.test(body)) {
    /* Unknown head: insert the model before the first qualifier. */
    const q = body.match(/\s(?=(?:с|со|без|на|для\s+\d)\s|\d)/u)
    body =
      q?.index != null
        ? `${body.slice(0, q.index)} ${modelName}${joinQualifiers(body.slice(q.index))}`
        : `${body} ${modelName}`
  }
  if (needsModel && body.includes(modelName!)) notes.push(`added_model:${modelName}`)

  title = parenParts.length ? `${body} (${parenParts.join(", ")})` : body
  title = title.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim()
  return { title, notes }
}
