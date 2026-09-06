/**
 * Buyer/admin-facing collection titles. Handles stay English.
 * Used by Woodright admin UI. Products often have no Medusa collection
 * relation — titles live in metadata.collection / metadata.collection_label.
 * Scope: Oliver / Oliver kids / Greenwich / Monchelsea / Provence / Willie Winkie.
 */
const COLLECTION_DISPLAY_LABELS: Record<string, string> = {
  oliver: "Оливер",
  "oliver-adult": "Оливер",
  "oliver-kids": "Оливер · детская",
  greenwich: "Гринвич",
  monchelsea: "Мончелси",
  provence: "Прованс",
  "willie-winkie": "Вилли Винки",
}

const TITLE_ALIASES: Record<string, string> = {
  oliver: "Оливер",
  оливер: "Оливер",
  "oliver-adult": "Оливер",
  "oliver-kids": "Оливер · детская",
  "oliver-kids-line": "Оливер · детская",
  "оливер-детская": "Оливер · детская",
  greenwich: "Гринвич",
  гринвич: "Гринвич",
  monchelsea: "Мончелси",
  мончелси: "Мончелси",
  provence: "Прованс",
  прованс: "Прованс",
  "willie-winkie": "Вилли Винки",
  "willie-winkie-kids": "Вилли Винки",
  "вилли-винки": "Вилли Винки",
  willie: "Вилли Винки",
}

function normalizeCollectionKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[·•]/g, " ")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
}

export function localizeCollectionDisplayTitle(
  title: string | null | undefined
): string | null {
  if (typeof title !== "string") return null
  const trimmed = title.trim()
  if (!trimmed) return null
  const key = normalizeCollectionKey(trimmed)
  return COLLECTION_DISPLAY_LABELS[key] ?? TITLE_ALIASES[key] ?? trimmed
}

export type AdminCollectionLabelInput = {
  collectionTitle?: string | null
  collectionHandle?: string | null
  metadataCollection?: string | null
  metadataCollectionLabel?: string | null
}

/**
 * Resolve a buyer/admin display label when Medusa collection relation is often null.
 * Preference: relation title → metadata.collection_label → metadata.collection → handle.
 */
export function resolveAdminCollectionLabel(
  input: AdminCollectionLabelInput
): string | null {
  const candidates = [
    input.collectionTitle,
    input.metadataCollectionLabel,
    input.metadataCollection,
    input.collectionHandle,
  ]
  for (const candidate of candidates) {
    const localized = localizeCollectionDisplayTitle(candidate)
    if (localized) return localized
  }
  return null
}
