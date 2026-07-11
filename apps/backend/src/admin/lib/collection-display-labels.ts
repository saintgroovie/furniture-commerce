/**
 * Buyer/admin-facing collection titles. Handles stay English.
 * Used by Woodright admin UI when Medusa `product_collection.title` is still EN.
 * Scope: Oliver / Greenwich / Monchelsea / Provence only.
 */
const COLLECTION_DISPLAY_LABELS: Record<string, string> = {
  oliver: "Оливер",
  greenwich: "Гринвич",
  monchelsea: "Мончелси",
  provence: "Прованс",
}

const TITLE_ALIASES: Record<string, string> = {
  oliver: "Оливер",
  оливер: "Оливер",
  greenwich: "Гринвич",
  гринвич: "Гринвич",
  monchelsea: "Мончелси",
  мончелси: "Мончелси",
  provence: "Прованс",
  прованс: "Прованс",
}

export function localizeCollectionDisplayTitle(
  title: string | null | undefined
): string | null {
  if (typeof title !== "string") return null
  const trimmed = title.trim()
  if (!trimmed) return null
  const key = trimmed.toLowerCase().replace(/[_\s]+/g, "-")
  return COLLECTION_DISPLAY_LABELS[key] ?? TITLE_ALIASES[key] ?? trimmed
}
