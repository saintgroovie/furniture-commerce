import type { ReviewRow } from "../source-media-orphan-review/source-orphan-review-types"

/** Collections with seeded products — Assign workflow operable today. */
export const OPERABLE_COLLECTIONS = new Set([
  "country-london-paris",
  "oliver",
  "provence",
])

export type CollectionGate =
  | "operable"
  | "oxford"
  | "monchelsea"
  | "willie-winkie"
  | "other"

export function collectionGate(collection: string | null | undefined): CollectionGate {
  const c = (collection || "").trim().toLowerCase()
  if (!c) return "other"
  if (OPERABLE_COLLECTIONS.has(c)) return "operable"
  if (c === "oxford") return "oxford"
  if (c === "monchelsea") return "monchelsea"
  if (c === "willie-winkie" || c === "molly") return "willie-winkie"
  return "other"
}

export function collectionGateMessage(gate: CollectionGate): string | null {
  switch (gate) {
    case "operable":
      return null
    case "oxford":
      return "Oxford: нужна ручная атрибуция фото→SKU (см. data/normalized/oxford-photo-attribution.json)."
    case "monchelsea":
      return "Monchelsea: нужны seed-строки и alias MN/MNm/MNM перед Assign."
    case "willie-winkie":
      return "Willie Winkie: заблокировано до подписанного vv-painting-sku-matrix."
    default:
      return "Коллекция вне pilot scope (CLP / Oliver / Provence)."
  }
}

/** Yandex Disk row without repo-local mirror — not assignable as catalog media. */
export function isYandexUnmirrored(
  row: Pick<ReviewRow, "source_kind" | "local_cache_path">
): boolean {
  return row.source_kind === "yandex_public" && !row.local_cache_path
}

export function canRouteToAssign(row: ReviewRow): boolean {
  if (isYandexUnmirrored(row)) return false
  if (row.cross_sku_risk) return false
  const gate = collectionGate(row.collection_guess)
  if (gate !== "operable") return false
  return Boolean(row.enrichment.sku_context.in_assignment_board && row.enrichment.sku_context.handle)
}
