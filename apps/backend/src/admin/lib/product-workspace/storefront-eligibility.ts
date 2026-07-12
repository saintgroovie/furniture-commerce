/**
 * H2 — storefront eligibility (discoverability), separate from content readiness.
 * Mirrors storefront catalog-scope + oliver-kids-scope / kids signals without
 * importing storefront packages. Room-set membership is NOT evaluated here —
 * copy must stay soft when kids/main listing depends on room sets.
 */

const PAUSED_COLLECTION_KEYS = new Set([
  "princess-rose",
  "country-london-paris",
  "oxford",
  "provence",
])

const ACTIVE_COLLECTION_KEYS = new Set([
  "greenwich",
  "oliver",
  "oliver-adult",
  "oliver-kids",
  "willie-winkie",
  "monchelsea",
])

const OLIVER_KIDS_COLLECTION_KEY = "oliver-kids"

/** Keep in sync with storefront `oliver-kids-scope.ts` OLIVER_KIDS_HANDLES. */
const OLIVER_KIDS_HANDLES = new Set([
  "ol-81-1",
  "ol-82-1",
  "ol-83-1",
  "ol-84-1",
  "ol-84-2",
  "ol-85-1",
  "ol-85-2",
  "ol-86-1",
  "ol-95-1",
  "ol-95-3",
])

export type StorefrontEligibilityKind =
  | "draft"
  | "direct_only"
  | "paused_collection"
  | "kids_catalog"
  | "main_catalog_candidate"
  | "unknown_collection"
  | "bespoke_quote"

export type StorefrontEligibilityVM = {
  kind: StorefrontEligibilityKind
  summary_label: string
  detail: string
  listed_in_main_catalog: boolean
  listed_in_kids_catalog: boolean
}

export type BuildStorefrontEligibilityInput = {
  status?: string | null
  metadata?: Record<string, unknown> | null
  handle?: string | null
  /** Woodright product_type when known */
  classificationCode?: string | null
}

function collectionKey(meta: Record<string, unknown> | null | undefined): string | null {
  const raw = meta?.collection
  if (typeof raw !== "string") return null
  // Storefront compares metadata.collection without trim — keep exact.
  return raw === "" ? null : raw
}

function storefrontSection(meta: Record<string, unknown> | null | undefined): string | null {
  const raw = meta?.storefront_section
  if (typeof raw !== "string") return null
  return raw === "" ? null : raw
}

function isOliverKidsHandle(handle: string | null | undefined): boolean {
  if (!handle) return false
  return OLIVER_KIDS_HANDLES.has(handle.trim().toLowerCase())
}

function isKidsSignal(input: {
  key: string | null
  section: string | null
  handle?: string | null
}): boolean {
  if (input.key === OLIVER_KIDS_COLLECTION_KEY) return true
  if (input.key === "willie-winkie") return true
  if (input.section === "kids") return true
  if (isOliverKidsHandle(input.handle)) return true
  return false
}

function inActiveCatalogScope(key: string | null): boolean {
  if (key == null) return true
  if (PAUSED_COLLECTION_KEYS.has(key)) return false
  if (ACTIVE_COLLECTION_KEYS.has(key)) return true
  return false
}

/**
 * Where a buyer can find this product on the current storefront contract.
 * Content completeness is out of scope — see `buildProductReadiness`.
 */
export function buildStorefrontEligibility(
  input: BuildStorefrontEligibilityInput
): StorefrontEligibilityVM {
  const status = (input.status ?? "").trim().toLowerCase()
  const key = collectionKey(input.metadata ?? null)
  const section = storefrontSection(input.metadata ?? null)
  const classification = (input.classificationCode ?? "").trim().toUpperCase()
  const kidsSignal = isKidsSignal({ key, section, handle: input.handle })
  const activeScope = inActiveCatalogScope(key)

  if (status !== "published") {
    return {
      kind: "draft",
      summary_label: "Не в каталоге",
      detail:
        "Статус не «Опубликован» — товар не попадает в списки каталога. Прямая ссылка /product/:id на стенде может всё ещё открываться.",
      listed_in_main_catalog: false,
      listed_in_kids_catalog: false,
    }
  }

  if (key && PAUSED_COLLECTION_KEYS.has(key)) {
    return {
      kind: "paused_collection",
      summary_label: "Опубликован, коллекция на паузе",
      detail: `metadata.collection=${key} скрыта на витрине. В каталогах не показывается.`,
      listed_in_main_catalog: false,
      listed_in_kids_catalog: false,
    }
  }

  if (classification === "BESPOKE") {
    return {
      kind: "bespoke_quote",
      summary_label: "На заказ — запрос, не каталожная покупка",
      detail:
        "BESPOKE на витрине идёт в сценарий запроса/цитаты и не считается обычной позицией kids/main cart-каталога.",
      listed_in_main_catalog: false,
      listed_in_kids_catalog: false,
    }
  }

  // Kids before unknown-collection so handle-based kids with active/empty scope still shows.
  if (kidsSignal && activeScope) {
    return {
      kind: "kids_catalog",
      summary_label: "Детский каталог (кандидат)",
      detail:
        "Сигнал kids (oliver-kids / willie-winkie / storefront_section=kids / handle ol-*). Не в основном /catalog. Room sets на этой карточке не проверяются — итоговый состав детского раздела может отличаться.",
      listed_in_main_catalog: false,
      listed_in_kids_catalog: true,
    }
  }

  if (key && !ACTIVE_COLLECTION_KEYS.has(key)) {
    return {
      kind: "unknown_collection",
      summary_label: "Опубликован, коллекция вне активных",
      detail: `metadata.collection=${key} не входит в активный набор витрины — в каталогах, скорее всего, не показывается.`,
      listed_in_main_catalog: false,
      listed_in_kids_catalog: false,
    }
  }

  if (!key) {
    return {
      kind: "direct_only",
      summary_label: "Опубликован, без metadata.collection",
      detail:
        "Без коллекции товар может проходить фильтр scope, но часто это демо/legacy. Проверьте основной каталог и прямую ссылку.",
      listed_in_main_catalog: true,
      listed_in_kids_catalog: false,
    }
  }

  return {
    kind: "main_catalog_candidate",
    summary_label: "Кандидат в основной каталог",
    detail: `Опубликован, коллекция «${key}» в активном наборе. Итоговый показ ещё зависит от фильтров витрины (не демо seed и т.п.).`,
    listed_in_main_catalog: true,
    listed_in_kids_catalog: false,
  }
}
